/** Mapeador RisOrder -> DICOM Modality Worklist (DICOM JSON, PS3.18 anexo F). */

const config = require('./mwl.config');
const { generateStudyInstanceUid, isValidUid } = require('./studyUid.generator');

// ── Limites de longitud por Value Representation (DICOM PS3.5 tabla 6.2-1) ──
const VR_MAX_LENGTH = {
  AE: 16,
  CS: 16,
  LO: 64,
  SH: 16,
  PN: 64, // por grupo de componentes
  UI: 64,
};

/** Valores permitidos para Patient Sex (0010,0040). */
const VALID_SEX = new Set(['M', 'F', 'O']);

/** Modalidades DICOM soportadas por esta primera etapa. */
const SUPPORTED_MODALITIES = new Set(['CT', 'DX', 'CR', 'US']);

/** Reduce un texto al repertorio ASCII por defecto de DICOM (ISO-IR 6). */
function toDicomAscii(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita los diacriticos ya separados
    .replace(/Ñ/g, 'N')
    .replace(/ñ/g, 'n')
    .replace(/[^\x20-\x7e]/g, '') // descarta lo que quede fuera de ASCII imprimible
    .trim();
}

/** Recorta al maximo del VR avisando en el log, en vez de dejar que falle el PACS. */
function fit(value, vr, fieldName) {
  const max = VR_MAX_LENGTH[vr];
  const text = toDicomAscii(value);
  if (max && text.length > max) {
    console.warn(
      `[MWL] "${fieldName}" excede ${max} caracteres para VR ${vr} y fue recortado: "${text}"`
    );
    return text.slice(0, max);
  }
  return text;
}

// ── Constructores de elementos DICOM JSON ────────────────────────────────────

const el = (vr, value) => ({ vr, Value: [value] });
const pn = value => ({ vr: 'PN', Value: [{ Alphabetic: value }] });
const empty = vr => ({ vr, Value: [] });

// ── Formatos de fecha y hora DICOM ───────────────────────────────────────────

const pad = n => String(n).padStart(2, '0');

/** Date -> DA (YYYYMMDD) en la zona horaria local del servidor. */
function toDA(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Date -> TM (HHMMSS) en hora local. */
function toTM(date) {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Construye el Patient Name en formato PN de DICOM: Apellidos^Nombres^SegundoNombre^Prefijo^Sufijo Solo se usan los dos primeros componentes. */
function buildPatientName(patient) {
  const last = toDicomAscii(patient.lastName).toUpperCase();
  const first = toDicomAscii(patient.firstName).toUpperCase();
  return `${last}^${first}`.replace(/\^+$/, '');
}

/** Normaliza el sexo: DICOM solo admite M, F, O o vacio. 'U' se envia vacio. */
function normalizeSex(gender) {
  const g = String(gender || '').toUpperCase();
  return VALID_SEX.has(g) ? g : '';
}

// ── Validacion ───────────────────────────────────────────────────────────────

/**
 * Verifica que la orden tenga todo lo que la MWL necesita.
 * @returns {string[]} lista de problemas; vacia si la orden es valida
 */
function validateOrder(order) {
  const problems = [];
  const patient = order.patient;

  if (!patient || typeof patient !== 'object') {
    problems.push('la orden no tiene el paciente cargado (falta populate("patient"))');
  } else {
    if (!patient.patientId) problems.push('el paciente no tiene patientId');
    if (!patient.lastName && !patient.firstName) problems.push('el paciente no tiene nombre');
  }

  if (!order.accessionNumber) {
    problems.push('falta accessionNumber');
  } else {
    // El accession number NO se recorta: es el identificador que une la orden del RIS con el estudio en el PACS. Si se envia mas largo, DCM4CHEE lo guarda truncado y el estudio queda con un numero distinto al del RIS, rompiendo la trazabilidad que exige la matriz de aceptacion.
    const acc = toDicomAscii(order.accessionNumber);
    if (acc.length > VR_MAX_LENGTH.SH) {
      problems.push(
        `el numero de orden "${acc}" tiene ${acc.length} caracteres y DICOM admite ` +
          `${VR_MAX_LENGTH.SH} como maximo. El PACS lo guardaria recortado y el estudio ` +
          `quedaria con un numero distinto al del RIS`
      );
    }
  }
  if (!order.scheduledDate) problems.push('falta scheduledDate');
  if (!order.modality) {
    problems.push('falta modality');
  } else if (!SUPPORTED_MODALITIES.has(String(order.modality).toUpperCase())) {
    problems.push(
      `modalidad "${order.modality}" no soportada en esta etapa ` +
        `(esperado: ${[...SUPPORTED_MODALITIES].join(', ')})`
    );
  }

  if (!config.resolveStationAet(order)) {
    problems.push(
      `no se pudo determinar a que equipo enviar el estudio de "${order.modality}". ` +
        `Cargar el AE Title del equipo en la pantalla de Equipos, o asignar el equipo ` +
        `en la orden si hay mas de uno de esa modalidad`
    );
  }

  if (order.studyInstanceUid && !isValidUid(order.studyInstanceUid)) {
    problems.push(`studyInstanceUid con formato invalido: "${order.studyInstanceUid}"`);
  }

  return problems;
}

// ── Mapeo principal ──────────────────────────────────────────────────────────

/** Deriva el Scheduled Procedure Step ID de la orden. */
function resolveSpsId(order) {
  return fit(
    order.scheduledProcedureStepId || order.accessionNumber,
    'SH',
    'ScheduledProcedureStepID'
  );
}

/**
 * Traduce una orden del RIS a un objeto DICOM JSON listo para POST /rs/mwlitems.
 * @param {object} order  RisOrder con el campo `patient` poblado
 * @returns {object} dataset DICOM JSON
 * @throws {Error} si la orden no es mapeable (con el detalle de que falta)
 */
function mapOrderToMwl(order) {
  const problems = validateOrder(order);
  if (problems.length) {
    throw new Error(`Orden no mapeable a MWL: ${problems.join('; ')}`);
  }

  const patient = order.patient;
  const scheduled = new Date(order.scheduledDate);
  const modality = String(order.modality).toUpperCase();
  const stationAet = config.resolveStationAet(order);
  const studyUid = order.studyInstanceUid || generateStudyInstanceUid();
  const spsId = resolveSpsId(order);

  const description =
    order.procedureDescription ||
    (order.serviceLines && order.serviceLines[0] && order.serviceLines[0].serviceName) ||
    modality;

  const dataset = {
    // ── Nivel raiz ───────────────────────────────────────────────────────────
    // Accession Number (0008,0050).
    '00080050': el('SH', fit(order.accessionNumber, 'SH', 'AccessionNumber')),
    // Referring Physician Name (0008,0090)
    '00080090': order.referringPhysician
      ? pn(fit(order.referringPhysician, 'PN', 'ReferringPhysicianName').toUpperCase())
      : empty('PN'),
    // Patient Name (0010,0010)
    '00100010': pn(fit(buildPatientName(patient), 'PN', 'PatientName')),
    // Patient ID (0010,0020)
    '00100020': el('LO', fit(patient.patientId, 'LO', 'PatientID')),
    // Patient Birth Date (0010,0030)
    '00100030': patient.dateOfBirth
      ? el('DA', toDA(new Date(patient.dateOfBirth)))
      : empty('DA'),
    // Patient Sex (0010,0040)
    '00100040': (() => {
      const sex = normalizeSex(patient.gender);
      return sex ? el('CS', sex) : empty('CS');
    })(),
    // Study Instance UID (0020,000D)
    '0020000D': el('UI', studyUid),
    // Requested Procedure Description (0032,1060)
    '00321060': el('LO', fit(description, 'LO', 'RequestedProcedureDescription')),
    // Requested Procedure ID (0040,1001)
    '00401001': el(
      'SH',
      fit(order.requestedProcedureId || order.accessionNumber, 'SH', 'RequestedProcedureID')
    ),

    // ── Scheduled Procedure Step Sequence (0040,0100) ───────────────────────
    // Todo lo que el equipo usa para filtrar su worklist va aqui adentro.
    '00400100': {
      vr: 'SQ',
      Value: [
        {
          // Scheduled Station AE Title (0040,0001)
          '00400001': el('AE', fit(stationAet, 'AE', 'ScheduledStationAETitle')),
          // Modality (0008,0060)
          '00080060': el('CS', modality),
          // Scheduled Procedure Step Start Date (0040,0002)
          '00400002': el('DA', toDA(scheduled)),
          // Scheduled Procedure Step Start Time (0040,0003)
          '00400003': el('TM', toTM(scheduled)),
          // Scheduled Procedure Step Description (0040,0007)
          '00400007': el('LO', fit(description, 'LO', 'ScheduledProcedureStepDescription')),
          // Scheduled Procedure Step ID (0040,0009)
          '00400009': el('SH', spsId),
          // Scheduled Procedure Step Status (0040,0020)
          '00400020': el('CS', 'SCHEDULED'),
        },
      ],
    },
  };

  return { dataset, studyInstanceUid: studyUid, spsId };
}

/**
 * Extrae del dataset MWL los tags demograficos del paciente (grupo 0010).
 * @param {object} dataset dataset MWL producido por mapOrderToMwl
 */
function extractPatientDataset(dataset) {
  const patient = {};
  for (const tag of ['00100010', '00100020', '00100030', '00100040']) {
    if (dataset[tag]) patient[tag] = dataset[tag];
  }
  return patient;
}

module.exports = {
  mapOrderToMwl,
  extractPatientDataset,
  validateOrder,
  resolveSpsId,
  // exportados para las pruebas unitarias
  toDA,
  toTM,
  toDicomAscii,
  buildPatientName,
  normalizeSex,
  SUPPORTED_MODALITIES,
  VR_MAX_LENGTH,
};
