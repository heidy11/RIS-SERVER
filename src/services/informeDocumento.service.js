// Documento del informe radiológico (PDF imprimible o DOCX), armado a partir del
// RisReport. Formato "clásico hospitalario": membrete con logo, tabla de datos del
// paciente con bordes, secciones del informe y bloque de firma.
//
// Datos del paciente: de la orden del RIS si el informe tiene una; si no (informe
// hecho desde el visor sobre un estudio sin orden), del propio estudio en el PACS.
const HTMLtoDOCX = require('@turbodocx/html-to-docx');
const Settings = require('../models/settings.model');
const axios = require('axios');

// Con el adaptador MWL instalado se usa su cliente (sabe autenticarse); sin él,
// QIDO directo al archivo local, que en el servidor responde sin login.
let dcm4chee = null;
try {
  dcm4chee = require('./mwl/dcm4chee.client');
} catch (e) {
  dcm4chee = null;
}
const QIDO_URL = process.env.INFORME_QIDO_URL || 'http://127.0.0.1:8080/dcm4chee-arc/aets/NUBEMEDVIEWER/rs';

async function buscarEstudio(studyInstanceUid) {
  if (dcm4chee) return dcm4chee.searchStudy(studyInstanceUid);
  const res = await axios.get(`${QIDO_URL}/studies`, {
    params: { StudyInstanceUID: studyInstanceUid, includefield: 'all', limit: 1 },
    timeout: 8000,
  });
  return res.status === 204 ? null : (res.data || [])[0] || null;
}

const TITULOS = {
  CT: 'INFORME TOMOGRÁFICO',
  MR: 'INFORME DE RESONANCIA MAGNÉTICA',
  US: 'INFORME ECOGRÁFICO',
  MG: 'INFORME MAMOGRÁFICO',
  CR: 'INFORME RADIOLÓGICO',
  DX: 'INFORME RADIOLÓGICO',
};
const SEXO = { M: 'Masculino', F: 'Femenino', O: 'Otro' };
const ETIQUETAS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'h3', 'h4', 'ul', 'ol', 'li'];

const escapar = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const esHtml = (s) => /<\/?(p|h[1-6]|ul|ol|li|br|strong|b|em|i|u|div)\b/i.test(s);

// Deja solo etiquetas de formato y sin atributos. El contenido lo escriben los
// médicos desde el visor, pero igual se limpia antes de meterlo en el documento.
function limpiarHtml(html) {
  return html
    .replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?div[^>]*>/gi, (t) => (t[1] === '/' ? '</p>' : '<p>'))
    .replace(/<\/?([a-z0-9]+)[^>]*>/gi, (t, tag) => {
      tag = tag.toLowerCase();
      if (!ETIQUETAS.includes(tag)) return '';
      return t[1] === '/' ? `</${tag}>` : `<${tag}>`;
    })
    .replace(/<p>\s*<\/p>/g, '');
}

// Informes viejos: texto plano con secciones en mayúsculas ("HALLAZGOS:")
function contenidoAHtml(texto) {
  if (!texto) return '';
  if (esHtml(texto)) return limpiarHtml(texto);
  return texto
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const s = linea.match(/^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 /().-]{2,}):\s*(.*)$/);
      if (s) return `<h4>${escapar(s[1])}</h4>${s[2] ? `<p>${escapar(s[2])}</p>` : ''}`;
      return `<p>${escapar(linea)}</p>`;
    })
    .join('');
}

const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) : '');
// Como en la plantilla del servicio: "24 de diciembre de 2025"
const fechaLarga = (d, timeZone = 'America/La_Paz') =>
  d ? new Date(d).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone }) : '';
const fechaHora = (d) =>
  d ? new Date(d).toLocaleString('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }) : '';

function edad(nacimiento, referencia = new Date()) {
  if (!nacimiento) return '';
  const n = new Date(nacimiento);
  const r = new Date(referencia);
  let e = r.getFullYear() - n.getFullYear();
  if (r < new Date(r.getFullYear(), n.getMonth(), n.getDate())) e--;
  return e >= 0 ? `${e} años` : '';
}

// --- Lectura de un dataset DICOM JSON (QIDO) ---
const valor = (ds, tag) => ds?.[tag]?.Value?.[0];
const nombreDicom = (pn) => {
  const s = typeof pn === 'string' ? pn : pn?.Alphabetic || '';
  return s.split('^').filter(Boolean).reverse().join(' ').trim();
};
// Fechas DICOM (AAAAMMDD) sin hora: en UTC, para que no cambien de día al mostrarlas
const fechaDicom = (d) => (d && d.length === 8 ? new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))) : null);

async function datosDelPacs(studyInstanceUid) {
  try {
    const ds = await buscarEstudio(studyInstanceUid);
    if (!ds) return {};
    const fechaEstudio = fechaDicom(valor(ds, '00080020'));
    return {
      paciente: nombreDicom(valor(ds, '00100010')),
      documento: valor(ds, '00100020'),
      edad: edad(fechaDicom(valor(ds, '00100030')), fechaEstudio || undefined),
      sexo: SEXO[valor(ds, '00100040')] || '',
      estudio: valor(ds, '00081030'),
      modalidad: (ds['00080061']?.Value || []).filter((m) => !['SR', 'PR', 'KO'].includes(m))[0],
      fechaEstudio: fechaLarga(fechaEstudio, 'UTC'),
      accession: valor(ds, '00080050'),
      solicitante: nombreDicom(valor(ds, '00080090')),
    };
  } catch (err) {
    console.warn(`[informe] no se pudo leer el estudio ${studyInstanceUid} del PACS: ${err.message}`);
    return {};
  }
}

function datosDeLaOrden(orden) {
  const p = orden.patient || {};
  return {
    paciente: [p.firstName, p.lastName].filter(Boolean).join(' '),
    documento: p.documentId || p.patientId,
    edad: orden.patientAge ? `${orden.patientAge} años` : edad(p.dateOfBirth, orden.scheduledDate),
    sexo: SEXO[p.gender] || '',
    estudio: orden.procedureDescription || orden.serviceLines?.map((l) => l.serviceName).filter(Boolean).join(', '),
    modalidad: orden.modality,
    fechaEstudio: fechaLarga(orden.scheduledDate),
    accession: orden.accessionNumber,
    solicitante: orden.referringPhysician,
  };
}

async function armarDatos(report) {
  const deOrden = report.order && report.order.patient ? datosDeLaOrden(report.order) : {};
  const faltan = !deOrden.paciente;
  const delPacs = faltan ? await datosDelPacs(report.studyInstanceUid) : {};
  const settings = await Settings.findOne({ singleton_id: 1 }).lean();
  return {
    ...delPacs,
    ...Object.fromEntries(Object.entries(deOrden).filter(([, v]) => v)),
    institucion: settings?.institution_name || 'Servicio de Imagenología',
    logo: settings?.logo_primary_base64 || null,
    medico: report.radiologist || '',
    firmado: report.status === 'SIGNED',
    firmadoEl: fechaHora(report.signedAt),
    cuerpo: contenidoAHtml(report.contentHtml),
    uid: report.studyInstanceUid,
  };
}

function srcLogo(logo) {
  if (!logo) return null;
  return logo.startsWith('data:') ? logo : `data:image/png;base64,${logo}`;
}

// Mismo HTML para la vista imprimible y para el DOCX: tablas y estilos en línea,
// que es lo que html-to-docx respeta.
function htmlInforme(d, { imprimir = false } = {}) {
  const titulo = TITULOS[d.modalidad] || 'INFORME RADIOLÓGICO';
  const celda = 'border:1px solid #6b7280;padding:4px 8px;font-size:10pt;';
  const fila = (a, b, c, e) => `<tr>
      <td style="${celda}background:#f3f4f6;width:18%;"><b>${a}</b></td><td style="${celda}width:32%;">${escapar(b) || '—'}</td>
      <td style="${celda}background:#f3f4f6;width:18%;"><b>${c}</b></td><td style="${celda}width:32%;">${escapar(e) || '—'}</td></tr>`;
  const logo = srcLogo(d.logo);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(titulo)} - ${escapar(d.paciente || 'Paciente')}</title>
<style>
  @page { size: A4; margin: 15mm 18mm 18mm; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111827; font-size: 11.5pt; line-height: 1.5; margin: 0; }
  .hoja { max-width: 760px; margin: 0 auto; padding: 24px; position: relative; }
  .cuerpo h3, .cuerpo h4 { font-size: 11pt; margin: 14px 0 4px; text-transform: uppercase; text-decoration: underline; }
  .cuerpo p { margin: 0 0 6px; text-align: justify; }
  /* Tamaño fijo: con 16vw se salía de la hoja en pantallas anchas */
  .borrador { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: 84pt; font-weight: bold; letter-spacing: 6px; color: rgba(185,28,28,.08); transform: rotate(-28deg); pointer-events: none; }
  @media print { .hoja { padding: 0; } }
</style></head><body><div class="hoja">
${d.firmado ? '' : '<div class="borrador">BORRADOR</div>'}
<table style="width:100%;border-collapse:collapse;border-bottom:2px solid #111827;">
  <tr>
    ${logo ? `<td style="width:90px;padding:0 12px 8px 0;vertical-align:middle;"><img src="${logo}" alt="" style="max-width:86px;max-height:70px;"></td>` : ''}
    <td style="padding:0 0 8px;vertical-align:middle;">
      <div style="font-size:16pt;font-weight:bold;text-transform:uppercase;">${escapar(d.institucion)}</div>
      <div style="font-size:10.5pt;">Servicio de Imagenología y Diagnóstico por Imágenes</div>
    </td>
  </tr>
</table>
<p style="text-align:center;font-size:13.5pt;font-weight:bold;letter-spacing:1px;margin:16px 0 10px;">${titulo}</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
  ${fila('NOMBRE', d.paciente, 'C.I. / ID', d.documento)}
  ${fila('ESTUDIO', d.estudio, 'EDAD / SEXO', [d.edad, d.sexo].filter(Boolean).join(' · '))}
  ${fila('FECHA', d.fechaEstudio, 'N.º DE ORDEN', d.accession)}
  ${fila('REMITE', d.solicitante, 'MODALIDAD', d.modalidad)}
</table>
<div class="cuerpo">${d.cuerpo || '<p><i>Informe sin contenido.</i></p>'}</div>
<table style="width:100%;margin-top:70px;"><tr><td style="width:25%;"></td>
  <td style="width:50%;text-align:center;border-top:1px solid #111827;padding-top:6px;font-size:10.5pt;">
    <b>${escapar(d.medico || 'Médico radiólogo')}</b><br>Médico Radiólogo
    ${d.firmado ? `<br><span style="font-size:8.5pt;color:#374151;">Firmado electrónicamente${d.firmadoEl ? ` el ${escapar(d.firmadoEl)}` : ''}</span>` : ''}
  </td><td style="width:25%;"></td></tr></table>
<p style="margin-top:30px;border-top:1px solid #d1d5db;padding-top:4px;font-size:7.5pt;color:#6b7280;">
  Estudio ${escapar(d.uid)} · Documento generado el ${escapar(fechaHora(new Date()))}
</p>
</div>${imprimir ? '<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>' : ''}</body></html>`;
}

async function docxInforme(d) {
  // html-to-docx no usa <style>: la marca de borrador va como texto en el título
  const html = htmlInforme(d).replace(/<div class="borrador">BORRADOR<\/div>/, '<p style="color:#b91c1c;font-weight:bold;text-align:center;">BORRADOR — sin firmar</p>');
  return HTMLtoDOCX(html, '', {
    orientation: 'portrait',
    title: TITULOS[d.modalidad] || 'Informe radiológico',
    creator: d.institucion,
    margins: { top: 850, right: 1000, bottom: 1000, left: 1000 },
    font: 'Times New Roman',
  });
}

const nombreArchivo = (d) =>
  `Informe ${d.paciente || 'paciente'} ${d.fechaEstudio || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '-');

module.exports = { armarDatos, htmlInforme, docxInforme, nombreArchivo, contenidoAHtml };
