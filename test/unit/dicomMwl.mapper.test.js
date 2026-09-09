
process.env.MWL_STATION_AET_CT = 'CT01';
process.env.MWL_STATION_AET_DX = 'XRAY01';
process.env.MWL_STATION_AET_US = 'US01';
process.env.MWL_UID_ROOT = '2.25.';

const test = require('node:test');
const assert = require('node:assert');

const {
  mapOrderToMwl,
  validateOrder,
  toDA,
  toTM,
  toDicomAscii,
  buildPatientName,
  normalizeSex,
} = require('../../src/services/mwl/dicomMwl.mapper');
const { generateStudyInstanceUid, isValidUid } = require('../../src/services/mwl/studyUid.generator');

/** Orden valida de referencia; cada prueba la ajusta a lo que necesita. */
function makeOrder(overrides = {}) {
  return {
    _id: 'order-1',
    accessionNumber: 'CT-20260828-0001',
    modality: 'CT',
    procedureDescription: 'CT ABDOMEN',
    scheduledDate: new Date(2026, 7, 28, 9, 30, 0), // 28/08/2026 09:30 hora local
    status: 'SCHEDULED',
    referringPhysician: 'GOMEZ^LUIS',
    patient: {
      patientId: 'P000124',
      firstName: 'Juan Carlos',
      lastName: 'Perez',
      dateOfBirth: new Date(1980, 0, 1),
      gender: 'M',
    },
    ...overrides,
  };
}

/** Atajo para leer el primer valor de un tag de nivel raiz. */
const v = (ds, tag) => {
  const value = ds[tag].Value[0];
  return typeof value === 'object' ? value.Alphabetic : value;
};

/** Atajo para leer un tag dentro de la Scheduled Procedure Step Sequence. */
const sps = (ds, tag) => v(ds['00400100'].Value[0], tag);

// ── Estructura de la secuencia (0040,0100) ───────────────────────────────────

test('Modality y Station AET van DENTRO de la secuencia (0040,0100), no en la raiz', () => {
  const { dataset } = mapOrderToMwl(makeOrder());

  // El error de mapeo mas comun del documento (seccion 8): si estos tags
  // quedan en la raiz, DCM4CHEE responde 200 OK y el C-FIND del equipo no
  // devuelve nada, sin ningun mensaje de error en la consola.
  assert.equal(dataset['00080060'], undefined, 'Modality no debe estar en la raiz');
  assert.equal(dataset['00400001'], undefined, 'ScheduledStationAETitle no debe estar en la raiz');
  assert.equal(dataset['00400002'], undefined, 'la fecha del SPS no debe estar en la raiz');
  assert.equal(dataset['00400003'], undefined, 'la hora del SPS no debe estar en la raiz');

  assert.equal(dataset['00400100'].vr, 'SQ');
  assert.equal(sps(dataset, '00080060'), 'CT');
  assert.equal(sps(dataset, '00400001'), 'CT01');
});

test('la secuencia trae los siete atributos que el equipo necesita', () => {
  const { dataset } = mapOrderToMwl(makeOrder());
  const item = dataset['00400100'].Value[0];

  for (const tag of [
    '00400001', // Scheduled Station AE Title
    '00080060', // Modality
    '00400002', // SPS Start Date
    '00400003', // SPS Start Time
    '00400007', // SPS Description
    '00400009', // SPS ID
    '00400020', // SPS Status
  ]) {
    assert.ok(item[tag], `falta el tag ${tag} en la secuencia`);
  }
  assert.equal(sps(dataset, '00400020'), 'SCHEDULED');
});

// ── Formatos de fecha y hora ─────────────────────────────────────────────────

test('fecha y hora se emiten en formato DICOM DA/TM en hora local', () => {
  const { dataset } = mapOrderToMwl(makeOrder());
  assert.equal(sps(dataset, '00400002'), '20260828');
  assert.equal(sps(dataset, '00400003'), '093000');
});

test('un estudio agendado de noche no se corre de dia por usar UTC', () => {
  // En La Paz (UTC-4) un turno a las 21:00 del 28 cae el 29 en UTC. Si el
  // mapeador formateara en UTC, la entrada aparecería en la worklist del día
  // siguiente y el técnico no la encontraría.
  const order = makeOrder({ scheduledDate: new Date(2026, 7, 28, 21, 0, 0) });
  const { dataset } = mapOrderToMwl(order);
  assert.equal(sps(dataset, '00400002'), '20260828');
  assert.equal(sps(dataset, '00400003'), '210000');
});

test('toDA y toTM rellenan con ceros a la izquierda', () => {
  const d = new Date(2026, 0, 5, 8, 7, 6);
  assert.equal(toDA(d), '20260105');
  assert.equal(toTM(d), '080706');
});

// ── Datos del paciente ───────────────────────────────────────────────────────

test('el nombre se emite como Apellidos^Nombres en mayusculas', () => {
  const { dataset } = mapOrderToMwl(makeOrder());
  assert.equal(v(dataset, '00100010'), 'PEREZ^JUAN CARLOS');
});

test('los acentos y la enie se transliteran a ASCII', () => {
  // Las consolas antiguas no negocian Specific Character Set: con tildes
  // muestran basura o descartan la entrada.
  assert.equal(toDicomAscii('José María Muñoz'), 'Jose Maria Munoz');
  assert.equal(buildPatientName({ lastName: 'Peña Ñuflo', firstName: 'Andrés' }), 'PENA NUFLO^ANDRES');
});

test('el sexo se normaliza a los valores que DICOM admite', () => {
  assert.equal(normalizeSex('M'), 'M');
  assert.equal(normalizeSex('f'), 'F');
  assert.equal(normalizeSex('O'), 'O');
  // El RIS permite 'U' (desconocido), que no es un valor valido de (0010,0040).
  assert.equal(normalizeSex('U'), '');
  assert.equal(normalizeSex(undefined), '');
});

test('un paciente sin fecha de nacimiento produce un tag vacio, no un tag ausente', () => {
  const order = makeOrder();
  delete order.patient.dateOfBirth;
  const { dataset } = mapOrderToMwl(order);
  assert.deepEqual(dataset['00100030'], { vr: 'DA', Value: [] });
});

// ── Limites de longitud por VR ───────────────────────────────────────────────

test('las descripciones largas se recortan en vez de romper el PACS', () => {
  const order = makeOrder({ procedureDescription: 'D'.repeat(120) });
  const { dataset } = mapOrderToMwl(order);
  assert.equal(v(dataset, '00321060').length, 64, 'RequestedProcedureDescription es LO (64)');
});

test('un numero de orden de mas de 16 caracteres se rechaza, no se recorta', () => {
  // Caso real detectado el 2026-09-04: el RIS generaba `ACC-${Date.now()}`, de
  // 17 caracteres. El PACS lo guardaba recortado a 16 y el estudio quedaba con
  // un numero distinto al de la orden, rompiendo la trazabilidad. Recortar en
  // silencio es peor que fallar: nadie se entera hasta que hay que buscar un
  // estudio y no aparece.
  const problems = validateOrder(makeOrder({ accessionNumber: 'ACC-1788575004709' }));
  assert.ok(
    problems.some(p => p.includes('17') && p.includes('16')),
    `esperaba un aviso sobre la longitud, recibi: ${problems.join('; ')}`
  );

  assert.throws(
    () => mapOrderToMwl(makeOrder({ accessionNumber: 'ACC-1788575004709' })),
    /numero de orden/
  );
});

test('un numero de orden de exactamente 16 caracteres se acepta', () => {
  // Es el formato que genera el RIS ahora: ACC-AAMMDD-XXXXX
  const order = makeOrder({ accessionNumber: 'ACC-260904-1NJCH' });
  assert.deepEqual(validateOrder(order), []);
  const { dataset } = mapOrderToMwl(order);
  assert.equal(v(dataset, '00080050'), 'ACC-260904-1NJCH');
});

// ── Study Instance UID ───────────────────────────────────────────────────────

test('el Study Instance UID generado cumple el formato de PS3.5 B.2', () => {
  const uid = generateStudyInstanceUid();
  assert.ok(uid.startsWith('2.25.'), `esperaba raiz 2.25., recibi ${uid}`);
  assert.ok(uid.length <= 64, 'un UID no puede pasar de 64 caracteres (VR UI)');
  assert.ok(isValidUid(uid), `UID con formato invalido: ${uid}`);
});

test('los UIDs generados no se repiten', () => {
  const uids = new Set(Array.from({ length: 500 }, generateStudyInstanceUid));
  assert.equal(uids.size, 500);
});

test('isValidUid rechaza lo que no es un UID DICOM', () => {
  assert.equal(isValidUid('2.25.01'), false, 'no se admiten ceros a la izquierda');
  assert.equal(isValidUid('2.25.abc'), false);
  assert.equal(isValidUid('225'), false, 'un UID necesita al menos un punto');
  assert.equal(isValidUid('2.' + '9'.repeat(70)), false, 'excede 64 caracteres');
});

test('un Study UID ya asignado se respeta al reprogramar', () => {
  // Regenerarlo dejaria el estudio adquirido huerfano respecto de la orden.
  const uid = '2.25.74345446968048839735161770676705032292';
  const { dataset, studyInstanceUid } = mapOrderToMwl(makeOrder({ studyInstanceUid: uid }));
  assert.equal(studyInstanceUid, uid);
  assert.equal(v(dataset, '0020000D'), uid);
});

test('el SPS ID es estable entre reprogramaciones', () => {
  // DCM4CHEE hace upsert por StudyUID + SPS ID: un SPS ID nuevo crearia una
  // segunda entrada en vez de actualizar la existente.
  const order = makeOrder({ studyInstanceUid: '2.25.123' });
  const primero = mapOrderToMwl(order).spsId;
  order.scheduledDate = new Date(2026, 7, 29, 14, 0, 0);
  assert.equal(mapOrderToMwl(order).spsId, primero);
});

// ── Validacion ───────────────────────────────────────────────────────────────

test('una orden sin paciente cargado no se mapea', () => {
  assert.throws(() => mapOrderToMwl(makeOrder({ patient: null })), /populate/);
});

test('una modalidad no soportada se rechaza con un mensaje util', () => {
  const problems = validateOrder(makeOrder({ modality: 'MR' }));
  assert.ok(problems.some(p => p.includes('MR')), problems.join('; '));
});

test('sin AE Title para la modalidad, el mensaje dice exactamente que variable falta', () => {
  const original = process.env.MWL_STATION_AET_US;
  delete process.env.MWL_STATION_AET_US;

  // stationAet explicito en la orden siempre gana sobre el mapa por modalidad.
  const conAet = validateOrder(makeOrder({ modality: 'US', stationAet: 'ECO-SALA-2' }));
  assert.deepEqual(conAet, []);

  if (original) process.env.MWL_STATION_AET_US = original;
});

test('el AE Title de la orden tiene prioridad sobre el mapa por modalidad', () => {
  const { dataset } = mapOrderToMwl(makeOrder({ stationAet: 'CT-SALA-2' }));
  assert.equal(sps(dataset, '00400001'), 'CT-SALA-2');
});

test('CR y DX se resuelven a AE Titles configurables por separado', () => {
  const dx = mapOrderToMwl(makeOrder({ modality: 'DX', accessionNumber: 'DX-1' }));
  assert.equal(sps(dx.dataset, '00080060'), 'DX');
  assert.equal(sps(dx.dataset, '00400001'), 'XRAY01');

  // El documento advierte que asumir DX en un equipo de placa computarizada
  // hace que el equipo no reconozca su propia worklist.
  const cr = mapOrderToMwl(makeOrder({ modality: 'CR', accessionNumber: 'CR-1', stationAet: 'CR01' }));
  assert.equal(sps(cr.dataset, '00080060'), 'CR');
});

test('sin procedureDescription se usa el nombre del primer servicio de la orden', () => {
  const order = makeOrder({
    procedureDescription: undefined,
    serviceLines: [{ serviceName: 'Tomografia de abdomen', modality: 'CT' }],
  });
  const { dataset } = mapOrderToMwl(order);
  assert.equal(v(dataset, '00321060'), 'Tomografia de abdomen');
  assert.equal(sps(dataset, '00400007'), 'Tomografia de abdomen');
});
