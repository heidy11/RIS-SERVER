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
// que es lo que html-to-docx respeta. La vista previa del visor (UploadDocuments.tsx,
// hojaHtml) arma la misma hoja: mantenerlas iguales.
// Colores del tema del MED Viewer (Blue-chill, --primary 180 100% 27%): el turquesa
// para líneas y bordes, y uno más oscuro para los títulos, que impreso se lea bien.
const ACENTO = '#008a8a';
const TINTA = '#00585c';
const SANS = 'Arial, Helvetica, sans-serif';

function htmlInforme(d, { imprimir = false } = {}) {
  const titulo = TITULOS[d.modalidad] || 'INFORME RADIOLÓGICO';
  const logo = srcLogo(d.logo);
  // Dato del paciente: etiqueta chica arriba, valor abajo
  const dato = (etiqueta, valor, ancho) => `<td style="width:${ancho};padding:7px 10px;vertical-align:top;border-right:1px solid #cfe7e7;">
      <div style="font-family:${SANS};font-size:6.5pt;letter-spacing:.8px;color:#6b7c85;text-transform:uppercase;">${etiqueta}</div>
      <div style="font-family:${SANS};font-size:9.5pt;font-weight:bold;color:#1f2a30;margin-top:2px;">${escapar(valor) || '—'}</div></td>`;
  const edadSexo = [d.edad, d.sexo].filter(Boolean).join(' · ');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(titulo)} - ${escapar(d.paciente || 'Paciente')}</title>
<style>
  @page { size: A4; margin: 14mm 16mm 16mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1f2a30; font-size: 11pt; line-height: 1.55; margin: 0; background: #fff; }
  .hoja { max-width: 760px; margin: 0 auto; padding: 26px 30px; position: relative; }
  .cuerpo h3, .cuerpo h4 { font-family: ${SANS}; font-size: 9.5pt; font-weight: bold; letter-spacing: 1.2px; color: ${TINTA};
    text-transform: uppercase; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #bfe0e0; }
  .cuerpo p { margin: 0 0 6px; text-align: justify; }
  .cuerpo ul, .cuerpo ol { margin: 0 0 6px 20px; padding: 0; }
  .borrador { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-family: ${SANS}; font-size: min(80pt, 12vw); font-weight: bold;
    letter-spacing: 8px; color: rgba(185,28,28,.07); transform: rotate(-28deg); pointer-events: none; }
  @media print { .hoja { padding: 0; } }
</style></head><body><div class="hoja">
${d.firmado ? '' : '<div class="borrador">BORRADOR</div>'}
<table style="width:100%;border-collapse:collapse;">
  <tr>
    ${logo ? `<td style="width:96px;padding:0 14px 10px 0;vertical-align:middle;"><img src="${logo}" alt="" style="max-width:92px;max-height:64px;"></td>` : ''}
    <td style="padding:0 0 10px;vertical-align:middle;">
      <div style="font-family:${SANS};font-size:15pt;font-weight:bold;color:${TINTA};letter-spacing:.3px;text-transform:uppercase;">${escapar(d.institucion)}</div>
      <div style="font-family:${SANS};font-size:8.5pt;color:#5b6b73;letter-spacing:.4px;margin-top:2px;">Servicio de Imagenología y Diagnóstico por Imágenes</div>
    </td>
  </tr>
</table>
<div style="height:3px;background:${ACENTO};"></div>
<div style="height:1px;background:#7fc6c6;margin-top:2px;"></div>
<p style="text-align:center;font-family:${SANS};font-size:13pt;font-weight:bold;letter-spacing:3px;color:${TINTA};margin:18px 0 2px;">${titulo}</p>
${d.estudio ? `<p style="text-align:center;font-family:${SANS};font-size:9pt;color:#5b6b73;letter-spacing:1px;margin:0 0 14px;text-transform:uppercase;">${escapar(d.estudio)}</p>` : '<div style="height:12px;"></div>'}
<table style="width:100%;border-collapse:collapse;background:#eef8f8;border:1px solid #cfe7e7;border-left:4px solid ${ACENTO};margin-bottom:8px;">
  <tr style="border-bottom:1px solid #cfe7e7;">
    ${dato('Paciente', d.paciente, '40%')}${dato('C.I. / ID', d.documento, '20%')}${dato('Edad / Sexo', edadSexo, '20%')}${dato('Fecha del estudio', d.fechaEstudio, '20%')}
  </tr>
  <tr>
    ${dato('Médico solicitante', d.solicitante, '40%')}${dato('Modalidad', d.modalidad, '20%')}${dato('N.º de orden', d.accession, '20%')}${dato('Médico informante', d.medico, '20%')}
  </tr>
</table>
<div class="cuerpo">${d.cuerpo || '<p><i>Informe sin contenido.</i></p>'}</div>
<table style="width:100%;margin-top:64px;border-collapse:collapse;"><tr><td style="width:45%;"></td>
  <td style="width:55%;text-align:center;font-family:${SANS};">
    <div style="border-top:1px solid #1f2a30;margin:0 30px;padding-top:6px;font-size:10.5pt;font-weight:bold;color:#1f2a30;">${escapar(d.medico || 'Médico radiólogo')}</div>
    <div style="font-size:8.5pt;color:#5b6b73;letter-spacing:.5px;">MÉDICO RADIÓLOGO</div>
    ${d.firmado ? `<div style="display:inline-block;margin-top:6px;padding:2px 10px;border:1px solid #16a34a;border-radius:99px;font-size:7.5pt;color:#15803d;letter-spacing:.5px;">✓ FIRMADO ELECTRÓNICAMENTE${d.firmadoEl ? ` · ${escapar(d.firmadoEl)}` : ''}</div>` : ''}
  </td></tr></table>
<table style="width:100%;margin-top:28px;border-collapse:collapse;border-top:1px solid #cfe7e7;"><tr>
  <td style="padding-top:5px;font-family:${SANS};font-size:7pt;color:#8a979e;">${escapar(d.institucion)} · Servicio de Imagenología</td>
  <td style="padding-top:5px;font-family:${SANS};font-size:7pt;color:#8a979e;text-align:right;">Generado el ${escapar(fechaHora(new Date()))} · Estudio ${escapar(String(d.uid || '').slice(-12))}</td>
</tr></table>
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
    font: 'Georgia',
  });
}

const nombreArchivo = (d) =>
  `Informe ${d.paciente || 'paciente'} ${d.fechaEstudio || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '-');

module.exports = { armarDatos, htmlInforme, docxInforme, nombreArchivo, contenidoAHtml };
