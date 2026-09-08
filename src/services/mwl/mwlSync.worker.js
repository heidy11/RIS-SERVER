/**
 * Worker de sincronizacion de Modality Worklist.
 *
 * Toma los registros PENDING del outbox y los empuja a DCM4CHEE con backoff
 * exponencial, siguiendo la politica de la seccion 5.3 del documento.
 *
 * Corre en el mismo proceso Express que el RIS. Es un setInterval y no una
 * cola distribuida a proposito: el volumen de una clinica son decenas de
 * ordenes por dia, no miles por segundo, y BullMQ/Redis agregaria una pieza de
 * infraestructura mas para operar sin beneficio real a esta escala. La
 * separacion en capas del modulo permite cambiar esto despues sin tocar el
 * mapeador ni el cliente.
 */

const MwlOutbox = require('../../models/MwlOutbox');
const RisOrder = require('../../models/RisOrder');
const MwlAuditLog = require('../../models/MwlAuditLog');
const config = require('./mwl.config');
const client = require('./dcm4chee.client');
const { extractPatientDataset } = require('./dicomMwl.mapper');

let workerTimer = null;
let reconciliationTimer = null;
let mppsTimer = null;
let running = false; // evita que dos ciclos se pisen si uno tarda mas que el intervalo

/** Metricas en memoria, expuestas por GET /api/mwl/health. */
const stats = {
  startedAt: null,
  processed: 0,
  synced: 0,
  failed: 0,
  lastCycleAt: null,
  lastError: null,
  lastReconciliationAt: null,
};

/**
 * Calcula cuando reintentar. El ultimo valor de la escalera se repite si se
 * configuraron menos escalones que reintentos maximos.
 * @param {number} attempts intentos ya realizados
 */
function nextAttemptDate(attempts) {
  const steps = config.backoffSeconds.length ? config.backoffSeconds : [5, 30, 120, 600, 1800];
  const seconds = steps[Math.min(attempts - 1, steps.length - 1)];
  return new Date(Date.now() + seconds * 1000);
}

/** Deja rastro de cada intento, exitoso o no (seccion 7.3: mwl_audit_log). */
async function audit(entry, { success, httpStatus, response }) {
  try {
    await MwlAuditLog.create({
      order: entry.order,
      accessionNumber: entry.accessionNumber,
      action: entry.operation,
      httpStatus: httpStatus === undefined ? null : httpStatus,
      success,
      response: response === undefined ? null : response,
    });
  } catch (err) {
    // La auditoria nunca debe tumbar la sincronizacion.
    console.warn(`[MWL] no se pudo escribir auditoria: ${err.message}`);
  }
}

/**
 * Procesa un registro del outbox.
 * @returns {Promise<'SYNCED'|'RETRY'|'ERROR'>}
 */
async function processEntry(entry) {
  const attempts = entry.attempts + 1;

  try {
    let httpStatus;

    if (entry.operation === 'DELETE') {
      const res = await client.deleteMwlItem(entry.studyInstanceUid, entry.spsId);
      httpStatus = res.status;
    } else {
      // El paciente tiene que existir en el archivo antes de la entrada MWL o
      // DCM4CHEE responde 404 "Patient[id=...] does not exist". Ambas llamadas
      // son idempotentes, asi que un reintento repite las dos sin efectos raros.
      await client.createOrUpdatePatient(extractPatientDataset(entry.payload));
      const res = await client.createOrUpdateMwlItem(entry.payload);
      httpStatus = res.status;
    }

    await MwlOutbox.updateOne(
      { _id: entry._id },
      {
        $set: {
          status: 'SYNCED',
          attempts,
          syncedAt: new Date(),
          lastHttpStatus: httpStatus,
          lastError: null,
        },
      }
    );

    // Una orden cancelada se queda en DISABLED: ya no esta en la worklist y no
    // tiene sentido mostrarla como "sincronizada" en la pantalla del RIS.
    await RisOrder.updateOne(
      { _id: entry.order },
      {
        $set: {
          mwlSyncStatus: entry.operation === 'DELETE' ? 'DISABLED' : 'SYNCED',
          mwlSyncedAt: new Date(),
          mwlLastError: null,
        },
      }
    );

    await audit(entry, { success: true, httpStatus });
    stats.synced++;
    console.log(
      `[MWL] ${entry.accessionNumber}: ${entry.operation} OK (HTTP ${httpStatus}, intento ${attempts})`
    );
    return 'SYNCED';
  } catch (err) {
    const status = err.status !== undefined ? err.status : null;
    const retryable = err.retryable !== false;
    const exhausted = attempts >= config.maxRetries;
    const giveUp = !retryable || exhausted;

    const reason = !retryable
      ? 'error no reintentable (revisar el mapeo DICOM)'
      : exhausted
        ? `se agotaron los ${config.maxRetries} reintentos`
        : `reintento ${attempts}/${config.maxRetries}`;

    await MwlOutbox.updateOne(
      { _id: entry._id },
      {
        $set: {
          status: giveUp ? 'ERROR' : 'PENDING',
          attempts,
          nextAttemptAt: giveUp ? entry.nextAttemptAt : nextAttemptDate(attempts),
          lastError: err.message,
          lastHttpStatus: status,
        },
      }
    );

    if (giveUp) {
      await RisOrder.updateOne(
        { _id: entry.order },
        { $set: { mwlSyncStatus: 'ERROR', mwlLastError: err.message } }
      );
      stats.failed++;
    }

    await audit(entry, { success: false, httpStatus: status, response: err.body });
    stats.lastError = `${entry.accessionNumber}: ${err.message}`;
    console.error(`[MWL] ${entry.accessionNumber}: ${entry.operation} fallo — ${reason} — ${err.message}`);
    return giveUp ? 'ERROR' : 'RETRY';
  }
}

/**
 * Un ciclo del worker: toma hasta workerBatchSize pendientes vencidos y los
 * procesa en serie.
 *
 * Se procesan en serie y no en paralelo porque varias operaciones sobre la
 * misma orden deben aplicarse en orden; con concurrencia, un UPDATE viejo
 * podria aterrizar despues del nuevo y dejar la worklist con la hora anterior.
 */
async function runCycle() {
  if (running) return;
  running = true;
  stats.lastCycleAt = new Date();

  try {
    const pending = await MwlOutbox.find({
      status: 'PENDING',
      nextAttemptAt: { $lte: new Date() },
    })
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(config.workerBatchSize);

    for (const entry of pending) {
      // Reserva optimista: si otro ciclo ya lo tomo, el update no matchea.
      const claimed = await MwlOutbox.findOneAndUpdate(
        { _id: entry._id, status: 'PENDING' },
        { $set: { status: 'PROCESSING' } },
        { new: true }
      );
      if (!claimed) continue;

      stats.processed++;
      await processEntry(claimed);
    }
  } catch (err) {
    stats.lastError = err.message;
    console.error(`[MWL] error en el ciclo del worker: ${err.message}`);
  } finally {
    running = false;
  }
}

/**
 * Reconciliacion: red de seguridad de la seccion 5.3.
 *
 * Compara las ordenes que el RIS cree agendadas contra lo que DCM4CHEE tiene
 * realmente en la worklist, y reencola las que falten. Cubre los casos que el
 * outbox no ve: alguien borro la entrada desde la UI de DCM4CHEE, se restauro
 * un backup del PACS, o una orden vieja quedo marcada SYNCED por un bug.
 */
async function runReconciliation() {
  try {
    const scheduled = await RisOrder.find({
      status: { $in: ['SCHEDULED', 'ARRIVED'] },
      mwlSyncStatus: 'SYNCED',
      studyInstanceUid: { $ne: null },
      scheduledDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).select('_id accessionNumber studyInstanceUid');

    if (!scheduled.length) {
      stats.lastReconciliationAt = new Date();
      return { checked: 0, requeued: 0 };
    }

    const remote = await client.searchMwlItems({}, 1000);
    const remoteUids = new Set(
      remote
        .map(item => (item['0020000D'] && item['0020000D'].Value ? item['0020000D'].Value[0] : null))
        .filter(Boolean)
    );

    // Se importa aqui y no arriba para evitar un ciclo de require entre el
    // worker y el servicio de outbox.
    const { enqueueUpsert } = require('./mwlOutbox.service');

    let requeued = 0;
    for (const order of scheduled) {
      if (!remoteUids.has(order.studyInstanceUid)) {
        console.warn(
          `[MWL] reconciliacion: ${order.accessionNumber} figura SYNCED pero no esta en la worklist de DCM4CHEE — reencolando`
        );
        await enqueueUpsert(order._id, 'UPDATE');
        requeued++;
      }
    }

    stats.lastReconciliationAt = new Date();
    console.log(`[MWL] reconciliacion: ${scheduled.length} revisadas, ${requeued} reencoladas`);
    return { checked: scheduled.length, requeued };
  } catch (err) {
    stats.lastError = `reconciliacion: ${err.message}`;
    console.error(`[MWL] error en la reconciliacion: ${err.message}`);
    return { checked: 0, requeued: 0, error: err.message };
  }
}

/** Arranca el worker. Sin efecto si MWL_ENABLED no es true. */
function start() {
  if (!config.enabled) {
    console.log('[MWL] Adapter desactivado (MWL_ENABLED != true).');
    return false;
  }
  if (workerTimer) return true;

  stats.startedAt = new Date();
  console.log(
    `[MWL] Adapter activo — worklist ${config.mwlBase}, archivo ${config.rsBase}, ` +
      `ciclo cada ${config.workerIntervalMs} ms`
  );

  workerTimer = setInterval(runCycle, config.workerIntervalMs);
  workerTimer.unref?.();

  if (config.reconciliationIntervalMs > 0) {
    reconciliationTimer = setInterval(runReconciliation, config.reconciliationIntervalMs);
    reconciliationTimer.unref?.();
  }

  // Etapa 2: estado real del estudio reportado por el equipo.
  if (config.mppsEnabled && config.mppsPollIntervalMs > 0) {
    const mpps = require('./mppsSync.service');
    console.log(`[MPPS] Seguimiento de estado activo, cada ${config.mppsPollIntervalMs} ms`);
    mppsTimer = setInterval(() => mpps.sincronizarEstados(), config.mppsPollIntervalMs);
    mppsTimer.unref?.();
  }

  runCycle();
  return true;
}

/** Detiene los temporizadores (usado en pruebas y en shutdown). */
function stop() {
  if (workerTimer) clearInterval(workerTimer);
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  if (mppsTimer) clearInterval(mppsTimer);
  workerTimer = null;
  reconciliationTimer = null;
  mppsTimer = null;
}

module.exports = { start, stop, runCycle, runReconciliation, stats, nextAttemptDate };
