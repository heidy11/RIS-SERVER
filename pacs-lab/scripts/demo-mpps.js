#!/usr/bin/env node
/**
 * Demostración de la Etapa 2 (MPPS) en una sola corrida.
 *
 *   node pacs-lab/scripts/demo-mpps.js
 *
 * Muestra el circuito completo del estado de un estudio:
 *   1. Crea una orden de prueba "agendada" en el RIS.
 *   2. Simula al equipo médico reportando el estudio al PACS por DICOM.
 *   3. Corre el job del adapter.
 *   4. Muestra cómo la orden cambió de estado sola.
 *
 * Usa una base de datos aparte (ris-mwl-demo) y borra todo al terminar, así
 * que no toca los datos reales del RIS.
 *
 * Requiere el lab levantado (docker compose -f pacs-lab/docker-compose.yml up -d)
 * y MongoDB corriendo.
 */

process.env.MWL_ENABLED = 'true';
process.env.MPPS_ENABLED = 'true';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');

const RAIZ = path.join(__dirname, '..', '..');
const DB = process.env.MPPS_DEMO_MONGO_URI || 'mongodb://localhost:27017/ris-mwl-demo';
const ACCESSION = 'DEMO-MPPS-001';
const PATIENT_ID = 'DEMOMPPS01';

const RisOrder = require(path.join(RAIZ, 'src/models/RisOrder'));
const RisPatient = require(path.join(RAIZ, 'src/models/RisPatient'));
const mppsService = require(path.join(RAIZ, 'src/services/mwl/mppsSync.service'));

const linea = (t = '') => console.log(t);
const paso = (n, t) => console.log(`\n${n}. ${t}\n${'─'.repeat(64)}`);

/** Busca un archivo DICOM de ejemplo para alimentar al equipo simulado. */
function buscarDicom() {
  const dir = path.join(RAIZ, 'src', 'temp');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find(n => n.toLowerCase().endsWith('.dcm'));
  return f ? { dir, nombre: f } : null;
}

/**
 * Lee el Study Instance UID del archivo con las herramientas dcm4che.
 * Se usa el del propio archivo porque el MPPS que genera el equipo lo hereda:
 * es lo que después permite unir el reporte del equipo con la orden del RIS.
 */
function leerStudyUid({ dir, nombre }) {
  const salida = execFileSync(
    'docker',
    [
      'run', '--rm',
      '-v', `${dir}:/data`,
      'dcm4che/dcm4che-tools:5.35.1',
      'dcm2xml', `/data/${nombre}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
  );
  const m = /keyword="StudyInstanceUID"[^>]*>\s*<Value number="1">([^<]+)</.exec(salida);
  return m ? m[1] : null;
}

/** Envía N-CREATE (IN PROGRESS) y N-SET (COMPLETED), como haría el equipo real. */
function simularEquipo({ dir, nombre }) {
  execFileSync(
    'docker',
    [
      'run', '--rm', '--network', 'pacs-lab_default',
      '-v', `${dir}:/data`,
      'dcm4che/dcm4che-tools:5.35.1',
      'mppsscu', '-c', 'DCM4CHEE@arc:11112', `/data/${nombre}`,
    ],
    { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
  );
}

async function limpiar() {
  await RisOrder.deleteMany({ accessionNumber: ACCESSION });
  await RisPatient.deleteMany({ patientId: PATIENT_ID });
}

async function main() {
  const dicom = buscarDicom();
  if (!dicom) {
    console.error('\n  No hay ningún archivo .dcm en src/temp para simular al equipo.\n');
    process.exit(1);
  }

  paso(1, 'Se agenda una orden en el RIS');

  await mongoose.connect(DB, { serverSelectionTimeoutMS: 3000 });
  await limpiar();

  const studyUid = leerStudyUid(dicom);
  if (!studyUid) {
    console.error('  No se pudo leer el Study Instance UID del archivo DICOM.');
    process.exit(1);
  }

  const paciente = await RisPatient.create({
    patientId: PATIENT_ID,
    firstName: 'Juan Carlos',
    lastName: 'Perez',
    gender: 'M',
    dateOfBirth: new Date(1980, 0, 1),
  });

  const orden = await RisOrder.create({
    accessionNumber: ACCESSION,
    patient: paciente._id,
    modality: 'CT',
    procedureDescription: 'CT ABDOMEN',
    scheduledDate: new Date(),
    status: 'SCHEDULED',
    studyInstanceUid: studyUid,
  });

  linea(`   Paciente        PEREZ^JUAN CARLOS`);
  linea(`   Orden           ${ACCESSION}`);
  linea(`   Study UID       ${studyUid}`);
  linea(`   Estado          ${orden.status}   ← el paciente todavía no pasó por el equipo`);

  paso(2, 'El equipo realiza el estudio y lo reporta al PACS por DICOM');
  linea('   Enviando N-CREATE (empezó) y N-SET (terminó) al PACS…');
  simularEquipo(dicom);
  linea('   El PACS aceptó el reporte del equipo.');

  paso(3, 'El adapter consulta el estado real de los estudios');
  const resultado = await mppsService.sincronizarEstados();
  linea(`   Órdenes revisadas: ${resultado.checked}   ·   actualizadas: ${resultado.updated}`);

  paso(4, 'El RIS ya refleja lo que pasó en sala');
  const final = await RisOrder.findById(orden._id);
  linea(`   Estado antes    SCHEDULED   (agendado)`);
  linea(`   Estado ahora    ${final.status}   ← cambió solo, nadie lo marcó a mano`);
  linea(`   Reportado por el equipo: "${final.mppsStatus}"`);
  linea('');

  await limpiar();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(`\n  ERROR: ${err.message}\n`);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
