// Carga masiva de la planilla Excel del laboratorio al RIS (pacientes + informes FIRMADOS).
//
//   node scripts/laboratorio/importar-lab.js registros.json --simular   (no escribe nada)
//   node scripts/laboratorio/importar-lab.js registros.json             (carga; imprime el lote)
//   node scripts/laboratorio/importar-lab.js --deshacer LOTE            (quita esa carga completa)
//
// registros.json lo arma leer_excel_lab.py. Usa MONGO_URI del entorno (o del .env).
// - Paciente: se reconoce por AVC + BENEF (como el registro del RIS); si no existe se crea
//   con ID MRN-AVC-BENEF.
// - Informe: uno por fila, FIRMADO, con los resultados en los mismos campos que guarda el
//   editor. Si esa fila ya se cargó, o el paciente ya tiene ese estudio ese día cargado a
//   mano, no se duplica.
// - Todo lo creado queda marcado con el lote para poder quitarlo con --deshacer.
// No imprime nombres ni datos de pacientes: solo cantidades.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const RisPatient = require('../../src/models/RisPatient');
const RisInformeLab = require('../../src/models/RisInformeLab');

const CENTRO = 'CIMFA VILLA TUNARI';
const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalogo-excel.json'), 'utf8'));
const categorias = Object.fromEntries(catalogo.categorias.map((c) => [c.id, c]));

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const iDeshacer = args.indexOf('--deshacer');
const norm = (v) => String(v ?? '').trim().toUpperCase();
const slug = (s) => norm(s).normalize('NFKD').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Mismo ruteo que el editor: hematología plana en la raíz, el resto en su bolsa
function armarDatos(valores) {
  const datos = {};
  const estudios = [];
  for (const [catId, vals] of Object.entries(valores || {})) {
    const cat = categorias[catId];
    if (!cat || !Object.keys(vals).length) continue;
    const params = Object.fromEntries(cat.params.map((p) => [p.key, p]));
    for (const [key, v] of Object.entries(vals)) {
      const p = params[key] || {};
      const modo = p.modeOverride || cat.storage.mode;
      const bolsa = p.bagOverride || cat.storage.bag;
      if (modo === 'flat') datos[key] = v;
      else datos[bolsa] = { ...(datos[bolsa] || {}), [key]: v };
    }
    estudios.push(cat.storage.tipoLab);
  }
  return { datos, estudios };
}

async function deshacer(lote) {
  const inf = await RisInformeLab.deleteMany({ 'origen.lote': lote });
  const pac = await RisPatient.collection.deleteMany({ 'origenCarga.lote': lote });
  console.log(`Lote ${lote}: ${inf.deletedCount} informes y ${pac.deletedCount} pacientes quitados`);
}

async function importar(archivo) {
  const { registros } = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const lote = `xls-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

  const pacientes = await RisPatient.find({}, { patientId: 1, numeroAsegurado: 1, codigoBeneficiario: 1 }).lean();
  const porAsegurado = new Map(pacientes.map((p) => [`${norm(p.numeroAsegurado)}|${norm(p.codigoBeneficiario)}`, p]));
  const porId = new Map(pacientes.map((p) => [norm(p.patientId), p]));
  const informes = await RisInformeLab.find({}, { informeId: 1, cod: 1, fecha: 1, estudiosRealizados: 1, origen: 1 }).lean();
  const idsInforme = new Set(informes.map((i) => i.informeId));
  const aMano = new Set();
  for (const i of informes) if (i.origen?.tipo !== 'excel') for (const e of i.estudiosRealizados || []) aMano.add(`${norm(i.cod)}|${i.fecha}|${e}`);

  const c = { registros: registros.length, pacientesNuevos: 0, pacientesExistentes: 0, informes: 0, sinAvc: 0, fechaEstimada: 0, fechaCorregida: 0, conOtros: 0 };
  const omitidos = { 'sin resultados': 0, 'sin fecha': 0, 'sin nombre': 0, 'fila ya cargada antes': 0, 'ya cargado a mano en el RIS': 0, 'fila repetida en el Excel': 0 };
  const porEstudio = {};
  const fechas = [];
  const nuevosPacientes = [];
  const nuevosInformes = [];
  const vistos = new Set();

  for (const r of registros) {
    const p = r.paciente;
    if (!p.nombres && !p.paterno) { omitidos['sin nombre']++; continue; }
    if (!r.fecha) { omitidos['sin fecha']++; continue; }
    const { datos, estudios } = armarDatos(r.valores);
    if (!estudios.length && !Object.keys(r.otros || {}).length) { omitidos['sin resultados']++; continue; }

    const informeId = `xls-${slug(r.archivo)}-${slug(r.hoja)}-${r.fila}`;
    if (idsInforme.has(informeId)) { omitidos['fila ya cargada antes']++; continue; }

    // Paciente: AVC + BENEF; sin AVC, por nombre (se marca para revisar)
    if (!p.avc) c.sinAvc++;
    const patientId = p.avc
      ? `MRN-${p.avc}${p.benef ? `-${p.benef}` : ''}`
      : `XLS-${slug(`${p.paterno} ${p.materno} ${p.nombres}`).toUpperCase()}`;
    let pac = (p.avc && porAsegurado.get(`${p.avc}|${p.benef}`)) || porId.get(norm(patientId));
    if (pac && !pac._nuevo) c.pacientesExistentes++;
    else if (pac) c.repetidos = (c.repetidos || 0) + 1;
    if (!pac) {
      pac = {
        _id: new mongoose.Types.ObjectId(), _nuevo: true, patientId,
        firstName: p.nombres || '-', lastName: [p.paterno, p.materno].filter(Boolean).join(' ') || '-',
        apellidoPaterno: p.paterno, apellidoMaterno: p.materno,
        numeroAsegurado: p.avc || undefined, codigoBeneficiario: p.benef || undefined,
        edad: Number(p.edad) || undefined, gender: ['M', 'F'].includes(p.genero) ? p.genero : 'U',
        phone: p.telefono || undefined, isActive: true,
        origenCarga: { tipo: 'excel', archivo: r.archivo, lote },
        createdAt: new Date(), updatedAt: new Date(),
      };
      porId.set(norm(patientId), pac);
      if (p.avc) porAsegurado.set(`${p.avc}|${p.benef}`, pac);
      nuevosPacientes.push(pac);
      c.pacientesNuevos++;
    }

    const cod = pac.patientId;
    if (estudios.some((e) => aMano.has(`${norm(cod)}|${r.fecha}|${e}`))) { omitidos['ya cargado a mano en el RIS']++; continue; }
    const llave = `${norm(cod)}|${r.fecha}|${[...estudios].sort().join(',')}|${JSON.stringify(r.valores)}`;
    if (vistos.has(llave)) { omitidos['fila repetida en el Excel']++; continue; }
    vistos.add(llave);

    nuevosInformes.push({
      informeId, cod, paciente: `${p.nombres} ${p.paterno}`.trim(), edad: p.edad, id_paciente: String(pac._id),
      codigoBeneficiario: p.benef || '-', codigoAsegurado: p.avc || '-', servicio: 'Laboratorio',
      estado: 'FIRMADO', fecha: r.fecha, creadoEn: new Date().toISOString(), estudiosRealizados: estudios,
      datos: {
        ...datos, ...r.raiz,
        paterno: p.paterno, materno: p.materno, nombres: p.nombres, edad: p.edad, genero: p.genero,
        avc: p.avc, benef: p.benef, consultorio: r.consultorio, medico_solicitante: r.medico,
        fecha_solicitud: r.fecha_solicitud, fecha_muestra: r.fecha_muestra, telefono: p.telefono,
        diagnostico: r.diagnostico, muestra: r.muestra, centro_asistencial: CENTRO, estadoInforme: 'FIRMADO',
        ...(r.fecha_estimada && { fecha_estimada: true }),
        ...(r.fecha_corregida && !r.fecha_estimada && { fecha_corregida: true }),
        ...(Object.keys(r.otros || {}).length && { excel_otros: r.otros }),
      },
      origen: { tipo: 'excel', archivo: r.archivo, hoja: r.hoja, fila: r.fila, lote },
      creadoPor: 'Carga Excel',
    });
    c.informes++;
    if (r.fecha_estimada) c.fechaEstimada++;
    else if (r.fecha_corregida) c.fechaCorregida++;
    if (Object.keys(r.otros || {}).length) c.conOtros++;
    fechas.push(r.fecha);
    for (const e of estudios) porEstudio[e] = (porEstudio[e] || 0) + 1;
  }

  fechas.sort();
  console.log(simular ? '=== SIMULACIÓN (no se escribió nada) ===' : `=== CARGA (lote ${lote}) ===`);
  console.log(`Filas leídas del Excel:      ${c.registros}`);
  console.log(`Informes FIRMADOS a crear:   ${c.informes}${fechas.length ? `  (del ${fechas[0]} al ${fechas[fechas.length - 1]})` : ''}`);
  console.log(`Pacientes nuevos a crear:    ${c.pacientesNuevos}`);
  console.log(`Pacientes con más de una visita en el Excel: ${c.repetidos || 0} informes extra`);
  console.log(`Informes de pacientes ya registrados en el RIS: ${c.pacientesExistentes}`);
  console.log(`Con fecha estimada (la fila no tenía fecha, revisar): ${c.fechaEstimada}`);
  console.log(`Fecha de examen mal escrita, se usó la de solicitud/muestra: ${c.fechaCorregida}`);
  console.log(`Con columnas sin campo en el RIS (guardadas aparte): ${c.conOtros}`);
  console.log(`Filas sin AVC (ID por nombre, revisar): ${c.sinAvc}`);
  console.log('No se cargan:', Object.entries(omitidos).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(' | ') || 'ninguna');
  console.log('Informes por estudio:', Object.entries(porEstudio).map(([k, n]) => `${k}: ${n}`).join(' | '));
  if (simular) return;

  if (nuevosPacientes.length) await RisPatient.collection.insertMany(nuevosPacientes.map(({ _nuevo, ...p }) => p), { ordered: false });
  if (nuevosInformes.length) await RisInformeLab.insertMany(nuevosInformes, { ordered: false });
  console.log(`Listo. Para quitar esta carga: node scripts/laboratorio/importar-lab.js --deshacer ${lote}`);
}

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Falta MONGO_URI');
  await mongoose.connect(uri);
  try {
    if (iDeshacer >= 0) await deshacer(args[iDeshacer + 1]);
    else await importar(args.find((a) => !a.startsWith('--')));
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
