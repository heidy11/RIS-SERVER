
const test = require('node:test');
const assert = require('node:assert');

const {
  referenciasDeLaOrden,
  estadoRisSegunMpps,
  esAvance,
} = require('../../src/services/mwl/mppsSync.service');
function makeMpps({
  status = 'IN PROGRESS',
  studyUid = '2.25.74345446968048839735161770676705032292',
  accession = 'CT-20260904-0001',
} = {}) {
  return {
    '00400252': { vr: 'CS', Value: [status] },
    '00080060': { vr: 'CS', Value: ['CT'] },
    // Scheduled Step Attributes Sequence: la copia que el equipo hace de la
    // entrada de worklist que consumio.
    '00400270': {
      vr: 'SQ',
      Value: [
        {
          '0020000D': { vr: 'UI', Value: [studyUid] },
          '00080050': { vr: 'SH', Value: [accession] },
        },
      ],
    },
  };
}

// ── Lectura del dataset ──────────────────────────────────────────────────────

test('los identificadores se leen de la secuencia (0040,0270), no de la raiz', () => {
  const mpps = makeMpps();
  const ref = referenciasDeLaOrden(mpps);
  assert.equal(ref.studyInstanceUid, '2.25.74345446968048839735161770676705032292');
  assert.equal(ref.accessionNumber, 'CT-20260904-0001');
});

test('un MPPS sin la secuencia no rompe, devuelve identificadores vacios', () => {
  assert.deepEqual(referenciasDeLaOrden({}), { studyInstanceUid: '', accessionNumber: '' });
  assert.deepEqual(referenciasDeLaOrden({ '00400270': { vr: 'SQ', Value: [] } }), {
    studyInstanceUid: '',
    accessionNumber: '',
  });
});

test('se tolera que el equipo complete solo uno de los dos identificadores', () => {
  // No todos los equipos rellenan ambos campos; por eso el job indexa por los dos.
  const soloUid = makeMpps();
  delete soloUid['00400270'].Value[0]['00080050'];
  assert.equal(referenciasDeLaOrden(soloUid).accessionNumber, '');
  assert.ok(referenciasDeLaOrden(soloUid).studyInstanceUid);
});

// ── Traduccion de estados ────────────────────────────────────────────────────

test('IN PROGRESS y COMPLETED se traducen al estado del RIS', () => {
  assert.equal(estadoRisSegunMpps('IN PROGRESS'), 'IN_PROGRESS');
  assert.equal(estadoRisSegunMpps('COMPLETED'), 'COMPLETED');
  assert.equal(estadoRisSegunMpps('in progress'), 'IN_PROGRESS');
});

test('DISCONTINUED no se traduce: queda para revision manual', () => {
  // Significa que el equipo abandono el estudio. Decidir solo entre "terminado"
  // y "cancelado" seria peor que dejarlo visible para que alguien lo mire.
  assert.equal(estadoRisSegunMpps('DISCONTINUED'), null);
  assert.equal(estadoRisSegunMpps(''), null);
  assert.equal(estadoRisSegunMpps(undefined), null);
});

// ── Reglas de transicion ─────────────────────────────────────────────────────

test('el estado solo avanza, nunca retrocede', () => {
  assert.equal(esAvance('SCHEDULED', 'IN_PROGRESS'), true);
  assert.equal(esAvance('ARRIVED', 'COMPLETED'), true);
  assert.equal(esAvance('IN_PROGRESS', 'COMPLETED'), true);

  // Un MPPS viejo que reaparezca no debe devolver a "en equipo" un estudio que
  // el radiologo ya dio por terminado e informado.
  assert.equal(esAvance('COMPLETED', 'IN_PROGRESS'), false);
  assert.equal(esAvance('IN_PROGRESS', 'IN_PROGRESS'), false);
  assert.equal(esAvance('COMPLETED', 'COMPLETED'), false);
});

test('una orden cancelada no se reactiva por un MPPS', () => {
  // CANCELED no esta en la escalera de estados, asi que nunca cuenta como avance.
  assert.equal(esAvance('CANCELED', 'IN_PROGRESS'), false);
  assert.equal(esAvance('CANCELED', 'COMPLETED'), false);
});
