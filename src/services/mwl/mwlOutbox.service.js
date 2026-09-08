/**
 * Encolado de operaciones de Modality Worklist.
 *
 * Es la unica puerta de entrada al adapter desde el resto del RIS: los
 * controladores llaman a estas funciones y siguen con lo suyo. Nada aqui habla
 * con DCM4CHEE — eso es trabajo del worker.
 *
 * Todas las funciones estan pensadas para no romper nunca el flujo del RIS: si
 * el encolado falla, se registra el error en la orden y se sigue. Que la
 * worklist quede desincronizada es un problema; que no se pueda agendar un
 * paciente porque el PACS esta caido, es un problema mucho peor.
 */

const MwlOutbox = require('../../models/MwlOutbox');
const RisOrder = require('../../models/RisOrder');
const Equipment = require('../../models/equipment.model');
const config = require('./mwl.config');
const { mapOrderToMwl, validateOrder, resolveSpsId } = require('./dicomMwl.mapper');
const { generateStudyInstanceUid } = require('./studyUid.generator');

/**
 * Carga la orden con el paciente poblado, que es lo que el mapeador necesita.
 * @param {string|object} orderOrId
 */
async function loadOrder(orderOrId) {
  const id = orderOrId && orderOrId._id ? orderOrId._id : orderOrId;
  return RisOrder.findById(id).populate('patient');
}

/**
 * Garantiza que la orden tenga Study Instance UID antes de mapearla.
 * Se persiste inmediatamente: si se generara en memoria y el proceso muriera,
 * el reintento produciria un UID distinto y quedarian dos entradas MWL.
 */
async function ensureStudyInstanceUid(order) {
  if (order.studyInstanceUid) return order.studyInstanceUid;
  const uid = generateStudyInstanceUid();
  order.studyInstanceUid = uid;
  await RisOrder.updateOne({ _id: order._id }, { $set: { studyInstanceUid: uid } });
  return uid;
}

/**
 * Determina a qué equipo va la orden y deja su AE Title en `order.stationAet`.
 *
 * Orden de prioridad:
 *   1. `stationAet` cargado a mano en la orden (gana siempre).
 *   2. AE Title del equipo asignado explícitamente a la orden.
 *   3. Único equipo activo de esa modalidad que soporte worklist.
 *   4. El mapa MWL_STATION_AET_<MODALIDAD> del .env (fallback de laboratorio).
 *
 * Si hay varios equipos de la misma modalidad no se elige ninguno al azar: se
 * deja que falle la validación con un mensaje claro, porque mandar un estudio
 * a la sala equivocada es peor que no mandarlo.
 *
 * @returns {Promise<string>} el AE Title resuelto, o '' si no se pudo
 */
async function resolveStationAet(order) {
  if (order.stationAet && String(order.stationAet).trim()) {
    return String(order.stationAet).trim();
  }

  if (order.equipment) {
    const asignado = await Equipment.findById(order.equipment).select('aeTitle name');
    if (asignado && asignado.aeTitle) {
      order.stationAet = asignado.aeTitle;
      return asignado.aeTitle;
    }
  }

  const modality = String(order.modality || '').toUpperCase();
  if (modality) {
    const candidatos = await Equipment.find({
      modality,
      status: true,
      supportsMwl: true,
      aeTitle: { $nin: [null, ''] },
    }).select('aeTitle name');

    if (candidatos.length === 1) {
      order.equipment = candidatos[0]._id;
      order.stationAet = candidatos[0].aeTitle;
      return candidatos[0].aeTitle;
    }

    if (candidatos.length > 1) {
      console.warn(
        `[MWL] ${order.accessionNumber}: hay ${candidatos.length} equipos ${modality} ` +
          `(${candidatos.map(e => e.name).join(', ')}). Asignar el equipo en la orden.`
      );
      return '';
    }
  }

  // Sin equipos cargados todavía, el .env sigue funcionando como hasta ahora.
  return config.resolveStationAet(order);
}

/** Marca la orden como no sincronizable y deja el motivo visible en el RIS. */
async function markOrderError(orderId, message) {
  await RisOrder.updateOne(
    { _id: orderId },
    { $set: { mwlSyncStatus: 'ERROR', mwlLastError: message } }
  );
}

/**
 * Encola la creacion o actualizacion de la entrada MWL de una orden.
 *
 * Agendar y reprogramar comparten camino porque DCM4CHEE hace upsert por
 * Study UID + SPS ID: el mismo POST crea o actualiza (seccion 6.3).
 *
 * @param {string|object} orderOrId
 * @param {'CREATE'|'UPDATE'} operation
 * @returns {Promise<object|null>} el registro de outbox, o null si no se encolo
 */
async function enqueueUpsert(orderOrId, operation = 'CREATE') {
  if (!config.enabled) return null;

  const order = await loadOrder(orderOrId);
  if (!order) return null;

  // Una orden cancelada no debe volver a la worklist por una actualizacion
  // de datos administrativos (p.ej. que alguien corrija el monto a cobrar).
  if (order.status === 'CANCELED') return null;

  // Resuelve a que equipo va la orden y lo deja guardado, para que en el RIS
  // se vea a que sala se mando cada estudio.
  const stationAet = await resolveStationAet(order);
  if (stationAet) {
    await RisOrder.updateOne(
      { _id: order._id },
      { $set: { stationAet, ...(order.equipment ? { equipment: order.equipment } : {}) } }
    );
  }

  const problems = validateOrder(order);
  if (problems.length) {
    const message = `No se puede sincronizar con la worklist: ${problems.join('; ')}`;
    console.warn(`[MWL] ${order.accessionNumber}: ${message}`);
    await markOrderError(order._id, message);
    return null;
  }

  await ensureStudyInstanceUid(order);

  let mapped;
  try {
    mapped = mapOrderToMwl(order);
  } catch (err) {
    console.warn(`[MWL] ${order.accessionNumber}: ${err.message}`);
    await markOrderError(order._id, err.message);
    return null;
  }

  // Una orden tiene un unico SPS, asi que las operaciones pendientes anteriores
  // sobre la misma orden quedan obsoletas: enviarlas solo escribiria datos
  // viejos encima de los nuevos. Se descartan antes de encolar la nueva.
  await MwlOutbox.updateMany(
    { order: order._id, status: { $in: ['PENDING', 'ERROR'] } },
    { $set: { status: 'ERROR', lastError: 'Reemplazada por una operacion mas reciente' } }
  );

  const entry = await MwlOutbox.create({
    order: order._id,
    accessionNumber: order.accessionNumber,
    operation,
    payload: mapped.dataset,
    studyInstanceUid: mapped.studyInstanceUid,
    spsId: mapped.spsId,
    status: 'PENDING',
    nextAttemptAt: new Date(),
  });

  await RisOrder.updateOne(
    { _id: order._id },
    { $set: { mwlSyncStatus: 'PENDING', mwlLastError: null } }
  );

  console.log(`[MWL] ${order.accessionNumber}: encolado ${operation}`);
  return entry;
}

/**
 * Encola el retiro de la entrada MWL (cancelacion de la orden).
 *
 * Recibe un snapshot y no un id porque tambien se usa al borrar la orden del
 * RIS, momento en el que el documento ya no existe para consultarle el UID.
 *
 * @param {{_id:any, accessionNumber:string, studyInstanceUid?:string}} orderSnapshot
 */
async function enqueueDelete(orderSnapshot) {
  if (!config.enabled) return null;
  if (!orderSnapshot || !orderSnapshot.studyInstanceUid) {
    // Sin Study UID nunca llego a crearse la entrada en el PACS: no hay nada
    // que retirar de la worklist.
    return null;
  }

  await MwlOutbox.updateMany(
    { order: orderSnapshot._id, status: 'PENDING' },
    { $set: { status: 'ERROR', lastError: 'Cancelada antes de sincronizar' } }
  );

  const entry = await MwlOutbox.create({
    order: orderSnapshot._id,
    accessionNumber: orderSnapshot.accessionNumber,
    operation: 'DELETE',
    payload: null,
    studyInstanceUid: orderSnapshot.studyInstanceUid,
    spsId: resolveSpsId(orderSnapshot),
    status: 'PENDING',
    nextAttemptAt: new Date(),
  });

  console.log(`[MWL] ${orderSnapshot.accessionNumber}: encolado DELETE`);
  return entry;
}

/**
 * Vuelve a poner en cola una orden que quedo en ERROR (reintento manual desde
 * el RIS, endpoint POST /api/mwl/orders/:accessionNumber/retry).
 */
async function retryOrder(accessionNumber) {
  const order = await RisOrder.findOne({ accessionNumber });
  if (!order) return { found: false };

  const operation = order.status === 'CANCELED' ? 'DELETE' : 'UPDATE';
  const entry =
    operation === 'DELETE' ? await enqueueDelete(order) : await enqueueUpsert(order, 'UPDATE');

  return { found: true, queued: Boolean(entry), operation };
}

module.exports = {
  enqueueUpsert,
  enqueueDelete,
  retryOrder,
  ensureStudyInstanceUid,
  resolveStationAet,
};
