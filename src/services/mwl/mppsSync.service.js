/** Sincronizacion de estado por MPPS (Etapa 2 del documento de integracion). */

const RisOrder = require('../../models/RisOrder');
const MwlAuditLog = require('../../models/MwlAuditLog');
const config = require('./mwl.config');
const client = require('./dcm4chee.client');

/** Metricas en memoria, expuestas en GET /api/mwl/health. */
const stats = {
  lastRunAt: null,
  lastError: null,
  checked: 0,
  updated: 0,
};

// ── Lectura del dataset MPPS ─────────────────────────────────────────────────

/** Primer valor de un tag de nivel raiz. */
function tag(ds, key) {
  const el = ds && ds[key];
  if (!el || !el.Value || !el.Value.length) return '';
  const v = el.Value[0];
  return typeof v === 'object' ? v.Alphabetic || '' : String(v);
}

/**
 * Los identificadores que unen el MPPS con la orden no estan en la raiz: viven dentro de la Scheduled Step Attributes Sequence (0040,0270), que es la copia que el equipo hace de la entrada de worklist que consumio.
 * @returns {{studyInstanceUid: string, accessionNumber: string}}
 */
function referenciasDeLaOrden(mpps) {
  const sq = mpps && mpps['00400270'];
  const item = sq && sq.Value && sq.Value.length ? sq.Value[0] : null;
  return {
    studyInstanceUid: item ? tag(item, '0020000D') : '',
    accessionNumber: item ? tag(item, '00080050') : '',
  };
}

/** Traduce el Performed Procedure Step Status (0040,0252) al estado del RIS. DISCONTINUED significa que el equipo abandono el estudio (el paciente se fue, se cancelo a mitad). */
function estadoRisSegunMpps(mppsStatus) {
  switch (String(mppsStatus || '').toUpperCase()) {
    case 'IN PROGRESS':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return null;
  }
}

/** El estado solo avanza, nunca retrocede. */
const ORDEN_DE_ESTADOS = ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

function esAvance(actual, nuevo) {
  const i = ORDEN_DE_ESTADOS.indexOf(actual);
  const j = ORDEN_DE_ESTADOS.indexOf(nuevo);
  // Ambos estados tienen que estar en la escalera.
  return i > -1 && j > -1 && j > i;
}

// ── Job principal ────────────────────────────────────────────────────────────

/**
 * Consulta el estado real de los estudios en curso y actualiza las ordenes.
 * @returns {Promise<{checked:number, updated:number, error?:string}>}
 */
async function sincronizarEstados() {
  try {
    const desde = new Date(Date.now() - config.mppsLookbackHours * 60 * 60 * 1000);

    const enCurso = await RisOrder.find({
      status: { $in: ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS'] },
      studyInstanceUid: { $nin: [null, ''] },
      scheduledDate: { $gte: desde },
    }).select('_id accessionNumber status studyInstanceUid');

    if (!enCurso.length) {
      stats.lastRunAt = new Date();
      stats.checked = 0;
      return { checked: 0, updated: 0 };
    }

    // Una sola consulta al PACS para todo el lote: pedir MPPS por estudio seria una peticion por orden cada minuto.
    const mppsItems = await client.searchMpps({}, 1000);

    // Se indexa por Study UID y tambien por accession, porque no todos los equipos completan los dos campos en la secuencia (0040,0270).
    const porStudyUid = new Map();
    const porAccession = new Map();
    for (const item of mppsItems) {
      const ref = referenciasDeLaOrden(item);
      const estado = tag(item, '00400252');
      if (ref.studyInstanceUid) porStudyUid.set(ref.studyInstanceUid, estado);
      if (ref.accessionNumber) porAccession.set(ref.accessionNumber, estado);
    }

    let updated = 0;

    for (const orden of enCurso) {
      const mppsStatus =
        porStudyUid.get(orden.studyInstanceUid) || porAccession.get(orden.accessionNumber);
      if (!mppsStatus) continue;

      const nuevoEstado = estadoRisSegunMpps(mppsStatus);

      if (!nuevoEstado) {
        // DISCONTINUED u otro valor: se deja constancia sin tocar el estado.
        await RisOrder.updateOne(
          { _id: orden._id },
          { $set: { mppsStatus, mppsUpdatedAt: new Date() } }
        );
        console.warn(
          `[MPPS] ${orden.accessionNumber}: el equipo reporto "${mppsStatus}". ` +
            `Requiere revision manual.`
        );
        continue;
      }

      if (!esAvance(orden.status, nuevoEstado)) {
        await RisOrder.updateOne(
          { _id: orden._id },
          { $set: { mppsStatus, mppsUpdatedAt: new Date() } }
        );
        continue;
      }

      await RisOrder.updateOne(
        { _id: orden._id },
        { $set: { status: nuevoEstado, mppsStatus, mppsUpdatedAt: new Date() } }
      );

      await MwlAuditLog.create({
        order: orden._id,
        accessionNumber: orden.accessionNumber,
        action: 'RECONCILE',
        success: true,
        response: { mppsStatus, estadoAnterior: orden.status, estadoNuevo: nuevoEstado },
      }).catch(() => {});

      updated++;
      console.log(
        `[MPPS] ${orden.accessionNumber}: ${orden.status} -> ${nuevoEstado} ` +
          `(el equipo reporto "${mppsStatus}")`
      );
    }

    stats.lastRunAt = new Date();
    stats.checked = enCurso.length;
    stats.updated += updated;
    stats.lastError = null;

    return { checked: enCurso.length, updated };
  } catch (err) {
    stats.lastError = err.message;
    console.error(`[MPPS] error consultando el estado de los estudios: ${err.message}`);
    return { checked: 0, updated: 0, error: err.message };
  }
}

module.exports = {
  sincronizarEstados,
  stats,
  // exportados para las pruebas unitarias
  referenciasDeLaOrden,
  estadoRisSegunMpps,
  esAvance,
};
