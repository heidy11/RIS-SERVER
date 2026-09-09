
process.env.MWL_ENABLED = 'true';
process.env.MWL_STATION_AET_CT = 'CT01';
process.env.MWL_STATION_AET_US = 'US01';
process.env.MWL_WORKER_INTERVAL_MS = '1000';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const config = require('../../src/services/mwl/mwl.config');
const client = require('../../src/services/mwl/dcm4chee.client');
const outbox = require('../../src/services/mwl/mwlOutbox.service');
const worker = require('../../src/services/mwl/mwlSync.worker');
const RisPatient = require('../../src/models/RisPatient');
const RisOrder = require('../../src/models/RisOrder');
const Equipment = require('../../src/models/equipment.model');
const MwlOutbox = require('../../src/models/MwlOutbox');
const MwlAuditLog = require('../../src/models/MwlAuditLog');

const TEST_DB = process.env.MWL_TEST_MONGO_URI || 'mongodb://localhost:27017/ris-mwl-test';
const ACCESSION = 'IT-CT-0001';
const PATIENT_ID = 'ITPAT0001';

async function infraDisponible() {
  try {
    await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 2000 });
  } catch {
    await mongoose.disconnect().catch(() => {});
    return 'MongoDB no responde en ' + TEST_DB;
  }

  const health = await client.healthCheck();
  if (!health.ok) {
    await mongoose.disconnect().catch(() => {});
    return `DCM4CHEE no responde en ${config.mwlBase} (${health.error})`;
  }
  return null;
}

/** Busca la entrada de worklist por accession number. */
async function buscarEnWorklist(accessionNumber) {
  const items = await client.searchMwlItems({ AccessionNumber: accessionNumber }, 10);
  return items[0] || null;
}

async function limpiar() {
  await Promise.all([
    RisOrder.deleteMany({ accessionNumber: ACCESSION }),
    RisPatient.deleteMany({ patientId: PATIENT_ID }),
    MwlOutbox.deleteMany({ accessionNumber: ACCESSION }),
    MwlAuditLog.deleteMany({ accessionNumber: ACCESSION }),
  ]);
}

test('flujo completo: agendar -> reprogramar -> cancelar', async t => {
  const motivo = await infraDisponible();
  if (motivo) {
    t.skip(`Infraestructura no disponible: ${motivo}`);
    return;
  }

  t.after(async () => {
    worker.stop();
    const order = await RisOrder.findOne({ accessionNumber: ACCESSION });
    if (order && order.studyInstanceUid) {
      await client.deleteMwlItem(order.studyInstanceUid, ACCESSION).catch(() => {});
    }
    await limpiar();
    await mongoose.disconnect();
  });

  await limpiar();

  // ── Agendar ────────────────────────────────────────────────────────────────
  const paciente = await RisPatient.create({
    patientId: PATIENT_ID,
    firstName: 'Juan Carlos',
    lastName: 'Perez',
    dateOfBirth: new Date(1980, 0, 1),
    gender: 'M',
  });

  const manana9 = new Date();
  manana9.setDate(manana9.getDate() + 1);
  manana9.setHours(9, 30, 0, 0);

  const orden = await RisOrder.create({
    accessionNumber: ACCESSION,
    patient: paciente._id,
    modality: 'CT',
    procedureDescription: 'CT ABDOMEN',
    scheduledDate: manana9,
    referringPhysician: 'GOMEZ^LUIS',
    status: 'SCHEDULED',
  });

  const encolado = await outbox.enqueueUpsert(orden._id, 'CREATE');
  assert.ok(encolado, 'la orden deberia haberse encolado');
  assert.equal(encolado.status, 'PENDING');
  assert.equal(encolado.operation, 'CREATE');

  await worker.runCycle();

  const trasCrear = await RisOrder.findById(orden._id);
  assert.equal(
    trasCrear.mwlSyncStatus,
    'SYNCED',
    `esperaba SYNCED, quedo ${trasCrear.mwlSyncStatus}: ${trasCrear.mwlLastError}`
  );
  assert.ok(trasCrear.studyInstanceUid, 'la orden deberia tener Study Instance UID');

  const enWorklist = await buscarEnWorklist(ACCESSION);
  assert.ok(enWorklist, 'la entrada deberia estar en la worklist de DCM4CHEE');

  const sps = enWorklist['00400100'].Value[0];
  assert.equal(enWorklist['00100020'].Value[0], PATIENT_ID);
  assert.equal(enWorklist['00100010'].Value[0].Alphabetic, 'PEREZ^JUAN CARLOS');
  assert.equal(sps['00080060'].Value[0], 'CT');
  assert.equal(sps['00400001'].Value[0], 'CT01');
  assert.equal(sps['00400003'].Value[0], '093000');
  assert.equal(enWorklist['0020000D'].Value[0], trasCrear.studyInstanceUid);

  // ── Reprogramar ────────────────────────────────────────────────────────────
  const manana14 = new Date(manana9);
  manana14.setHours(14, 15, 0, 0);
  await RisOrder.updateOne({ _id: orden._id }, { $set: { scheduledDate: manana14 } });
  await outbox.enqueueUpsert(orden._id, 'UPDATE');
  await worker.runCycle();

  const reprogramada = await buscarEnWorklist(ACCESSION);
  assert.equal(reprogramada['00400100'].Value[0]['00400003'].Value[0], '141500');
  assert.equal(
    reprogramada['0020000D'].Value[0],
    trasCrear.studyInstanceUid,
    'reprogramar no debe cambiar el Study Instance UID'
  );

  // Upsert: la reprogramacion actualiza la entrada, no crea una segunda.
  const items = await client.searchMwlItems({ AccessionNumber: ACCESSION }, 10);
  assert.equal(items.length, 1, 'no deberia haber entradas duplicadas tras reprogramar');

  // ── Cancelar ───────────────────────────────────────────────────────────────
  const paraCancelar = await RisOrder.findByIdAndUpdate(
    orden._id,
    { $set: { status: 'CANCELED' } },
    { new: true }
  );
  await outbox.enqueueDelete(paraCancelar);
  await worker.runCycle();

  assert.equal(await buscarEnWorklist(ACCESSION), null, 'la entrada deberia haberse retirado');
  const cancelada = await RisOrder.findById(orden._id);
  assert.equal(cancelada.mwlSyncStatus, 'DISABLED');

  // ── Auditoria ──────────────────────────────────────────────────────────────
  const auditoria = await MwlAuditLog.find({ accessionNumber: ACCESSION }).sort({ occurredAt: 1 });
  assert.deepEqual(
    auditoria.map(a => a.action),
    ['CREATE', 'UPDATE', 'DELETE'],
    'cada operacion deberia haber dejado su registro de auditoria'
  );
  assert.ok(
    auditoria.every(a => a.success),
    'los tres intentos deberian figurar como exitosos'
  );
});

test('el AE Title sale del equipo cargado en el RIS, no del .env', async t => {
  const motivo = await infraDisponible();
  if (motivo) {
    t.skip(`Infraestructura no disponible: ${motivo}`);
    return;
  }

  const accession = 'IT-EQ-0001';
  const limpiarEste = async () => {
    await Promise.all([
      RisOrder.deleteMany({ accessionNumber: accession }),
      RisPatient.deleteMany({ patientId: 'ITPATEQ' }),
      Equipment.deleteMany({ name: /^IT Eco/ }),
      MwlOutbox.deleteMany({ accessionNumber: accession }),
    ]);
  };

  t.after(async () => {
    await limpiarEste();
    await mongoose.disconnect();
  });
  await limpiarEste();

  const paciente = await RisPatient.create({
    patientId: 'ITPATEQ',
    firstName: 'Rosa',
    lastName: 'Mamani',
    gender: 'F',
  });

  const eco = await Equipment.create({
    name: 'IT Eco Sala 2',
    aeTitle: 'ECO-SALA-2',
    modality: 'US',
    ipAddress: '192.168.50.41',
    dicomPort: 104,
    supportsMwl: true,
  });

  const orden = await RisOrder.create({
    accessionNumber: accession,
    patient: paciente._id,
    modality: 'US',
    procedureDescription: 'ECOGRAFIA ABDOMINAL',
    scheduledDate: new Date(),
    status: 'SCHEDULED',
  });

  // Sin stationAet ni equipo asignado: debe encontrar el unico ecografo activo
  // y quedarse con su AE Title, en vez del US01 que define el .env.
  const encolado = await outbox.enqueueUpsert(orden._id, 'CREATE');
  assert.ok(encolado, 'deberia haberse encolado');

  const guardada = await RisOrder.findById(orden._id);
  assert.equal(guardada.stationAet, 'ECO-SALA-2');
  assert.equal(String(guardada.equipment), String(eco._id));
  assert.equal(
    encolado.payload['00400100'].Value[0]['00400001'].Value[0],
    'ECO-SALA-2',
    'el AE Title del equipo debe viajar dentro de la secuencia del SPS'
  );

  // Con dos ecografos activos ya no se puede adivinar: hay que elegir el equipo
  // en la orden. Mandar el estudio a la sala equivocada es peor que no mandarlo.
  await Equipment.create({
    name: 'IT Eco Sala 3',
    aeTitle: 'ECO-SALA-3',
    modality: 'US',
    supportsMwl: true,
  });

  const otra = await RisOrder.create({
    accessionNumber: accession + 'B',
    patient: paciente._id,
    modality: 'US',
    scheduledDate: new Date(),
    status: 'SCHEDULED',
  });

  const aet = await outbox.resolveStationAet(otra);
  assert.equal(aet, '', 'con dos equipos de la misma modalidad no debe elegir uno al azar');

  await RisOrder.deleteMany({ accessionNumber: accession + 'B' });
});

test('una orden invalida queda en ERROR sin llegar a golpear el PACS', async t => {
  const motivo = await infraDisponible();
  if (motivo) {
    t.skip(`Infraestructura no disponible: ${motivo}`);
    return;
  }

  const accession = 'IT-BAD-0001';
  t.after(async () => {
    await RisOrder.deleteMany({ accessionNumber: accession });
    await RisPatient.deleteMany({ patientId: 'ITPATBAD' });
    await MwlOutbox.deleteMany({ accessionNumber: accession });
    await mongoose.disconnect();
  });

  const paciente = await RisPatient.create({
    patientId: 'ITPATBAD',
    firstName: 'Ana',
    lastName: 'Lopez',
    gender: 'F',
  });

  // MR no esta en el alcance de esta etapa y no tiene AE Title configurado.
  const orden = await RisOrder.create({
    accessionNumber: accession,
    patient: paciente._id,
    modality: 'MR',
    scheduledDate: new Date(),
    status: 'SCHEDULED',
  });

  const encolado = await outbox.enqueueUpsert(orden._id, 'CREATE');
  assert.equal(encolado, null, 'no deberia encolarse una orden que no se puede mapear');

  const guardada = await RisOrder.findById(orden._id);
  assert.equal(guardada.mwlSyncStatus, 'ERROR');
  assert.match(guardada.mwlLastError, /MR/);
});
