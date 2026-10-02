// Genera una imagen de tomografía sintética (un fantoma: cuerpo, pulmones, columna) como
// archivo DICOM, sin librerías externas. Sirve para simular lo que guarda el equipo en el
// PACS al terminar un estudio, sin usar imágenes de pacientes reales.
const crypto = require('crypto');

const CT_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.2';
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1';
const LONG_VRS = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'SQ', 'UT', 'UN', 'UC', 'UR']);
const FILAS = 256;
const COLUMNAS = 256;

/** UID derivado de UUID (raíz 2.25, DICOM PS3.5 B.2): no requiere OID registrado. */
function nuevoUid() {
  return `2.25.${BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString(10)}`;
}

function elemento(grupo, elem, vr, valor) {
  let datos;
  if (vr === 'US') {
    datos = Buffer.alloc(2);
    datos.writeUInt16LE(valor);
  } else if (vr === 'UL') {
    datos = Buffer.alloc(4);
    datos.writeUInt32LE(valor);
  } else if (Buffer.isBuffer(valor)) {
    datos = valor;
  } else {
    datos = Buffer.from(String(valor), 'utf8');
  }
  if (datos.length % 2) {
    const relleno = vr === 'UI' || vr === 'OB' ? 0x00 : 0x20;
    datos = Buffer.concat([datos, Buffer.from([relleno])]);
  }

  const largo = LONG_VRS.has(vr);
  const cabecera = Buffer.alloc(largo ? 12 : 8);
  cabecera.writeUInt16LE(grupo, 0);
  cabecera.writeUInt16LE(elem, 2);
  cabecera.write(vr, 4, 'ascii');
  if (largo) cabecera.writeUInt32LE(datos.length, 8);
  else cabecera.writeUInt16LE(datos.length, 6);
  return Buffer.concat([cabecera, datos]);
}

/** Valores almacenados = HU + 1024 (RescaleIntercept -1024), 12 bits. */
function pixelesFantoma() {
  const px = Buffer.alloc(FILAS * COLUMNAS * 2);
  const cx = COLUMNAS / 2;
  const cy = FILAS / 2;
  let semilla = 12345;
  const ruido = () => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return (semilla % 21) - 10;
  };
  const dentro = (x, y, ex, ey, rx, ry) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1;

  for (let y = 0; y < FILAS; y++) {
    for (let x = 0; x < COLUMNAS; x++) {
      let hu = -1000;
      if (dentro(x, y, cx, cy, 112, 86)) {
        hu = 40 + ruido();
        if (dentro(x, y, cx - 46, cy - 6, 34, 52) || dentro(x, y, cx + 46, cy - 6, 34, 52)) hu = -820 + ruido();
        if (dentro(x, y, cx + 8, cy + 6, 26, 22)) hu = 50 + ruido();
        if (dentro(x, y, cx, cy + 62, 14, 14)) hu = 700 + ruido();
      }
      const valor = Math.max(0, Math.min(4095, hu + 1024));
      px.writeUInt16LE(valor, (y * COLUMNAS + x) * 2);
    }
  }
  return px;
}

/**
 * Arma un archivo DICOM de tomografía con los datos de una entrada de worklist.
 * @param {{pacienteNombre:string, pacienteId:string, accession:string,
 *          studyInstanceUid:string, descripcion?:string, modalidad?:string}} datos
 * @returns {{archivo: Buffer, seriesInstanceUid: string, sopInstanceUid: string}}
 */
function crearInstancia(datos) {
  const sopInstanceUid = nuevoUid();
  const seriesInstanceUid = nuevoUid();
  const ahora = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`;
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;

  // Los elementos tienen que ir en orden ascendente de tag.
  const dataset = Buffer.concat([
    elemento(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    elemento(0x0008, 0x0016, 'UI', CT_IMAGE_STORAGE),
    elemento(0x0008, 0x0018, 'UI', sopInstanceUid),
    elemento(0x0008, 0x0020, 'DA', fecha),
    elemento(0x0008, 0x0030, 'TM', hora),
    elemento(0x0008, 0x0050, 'SH', datos.accession),
    elemento(0x0008, 0x0060, 'CS', datos.modalidad || 'CT'),
    elemento(0x0008, 0x0080, 'LO', 'PRUEBA RIS'),
    elemento(0x0008, 0x1030, 'LO', datos.descripcion || 'Simulacion de estudio'),
    elemento(0x0008, 0x103e, 'LO', 'SIMULACION RIS - NO DIAGNOSTICO'),
    elemento(0x0010, 0x0010, 'PN', datos.pacienteNombre),
    elemento(0x0010, 0x0020, 'LO', datos.pacienteId),
    elemento(0x0018, 0x0050, 'DS', '5'),
    elemento(0x0020, 0x000d, 'UI', datos.studyInstanceUid),
    elemento(0x0020, 0x000e, 'UI', seriesInstanceUid),
    elemento(0x0020, 0x0011, 'IS', '1'),
    elemento(0x0020, 0x0013, 'IS', '1'),
    elemento(0x0020, 0x0032, 'DS', '0\\0\\0'),
    elemento(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'),
    elemento(0x0028, 0x0002, 'US', 1),
    elemento(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    elemento(0x0028, 0x0010, 'US', FILAS),
    elemento(0x0028, 0x0011, 'US', COLUMNAS),
    elemento(0x0028, 0x0030, 'DS', '0.7\\0.7'),
    elemento(0x0028, 0x0100, 'US', 16),
    elemento(0x0028, 0x0101, 'US', 12),
    elemento(0x0028, 0x0102, 'US', 11),
    elemento(0x0028, 0x0103, 'US', 0),
    elemento(0x0028, 0x1050, 'DS', '40'),
    elemento(0x0028, 0x1051, 'DS', '400'),
    elemento(0x0028, 0x1052, 'DS', '-1024'),
    elemento(0x0028, 0x1053, 'DS', '1'),
    elemento(0x7fe0, 0x0010, 'OW', pixelesFantoma()),
  ]);

  const meta = Buffer.concat([
    elemento(0x0002, 0x0001, 'OB', Buffer.from([0x00, 0x01])),
    elemento(0x0002, 0x0002, 'UI', CT_IMAGE_STORAGE),
    elemento(0x0002, 0x0003, 'UI', sopInstanceUid),
    elemento(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
    elemento(0x0002, 0x0012, 'UI', '2.25.1'),
  ]);

  const archivo = Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM', 'ascii'),
    elemento(0x0002, 0x0000, 'UL', meta.length),
    meta,
    dataset,
  ]);
  return { archivo, seriesInstanceUid, sopInstanceUid };
}

module.exports = { crearInstancia };
