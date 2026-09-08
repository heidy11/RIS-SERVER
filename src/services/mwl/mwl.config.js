/**
 * Configuracion del RIS-PACS Adapter (Modality Worklist).
 *
 * Todo lo que cambia entre el laboratorio local y el PACS del hospital vive
 * aqui. Los defaults apuntan al lab de ./pacs-lab para que el modulo funcione
 * recien clonado el repo, sin tocar el .env.
 */

/** Lee una variable de entorno con default y recorta espacios. */
function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === null || v.trim() === '' ? fallback : v.trim();
}

/**
 * AE Title de la estacion (equipo) por modalidad DICOM.
 *
 * Este es el valor de Scheduled Station AE Title (0040,0001): el equipo solo
 * ve en su worklist las entradas cuyo AE Title coincide con el suyo. Debe
 * salir del DICOM Conformance Statement de cada equipo, no asumirse.
 *
 * Se define por variables MWL_STATION_AET_<MODALIDAD>, p.ej.:
 *   MWL_STATION_AET_CT=CT01
 *   MWL_STATION_AET_DX=XRAY01
 *   MWL_STATION_AET_US=US01
 */
function stationAetMap() {
  const map = {};
  for (const [key, value] of Object.entries(process.env)) {
    const m = /^MWL_STATION_AET_([A-Z]{2,4})$/.exec(key);
    if (m && value && value.trim()) map[m[1]] = value.trim();
  }
  // Defaults del laboratorio (seccion 12 del documento de integracion).
  return { CT: 'CT01', DX: 'XRAY01', CR: 'XRAY01', US: 'US01', ...map };
}

const config = {
  /** Interruptor maestro: si esta en false el RIS funciona igual que hoy. */
  enabled: env('MWL_ENABLED', 'false') === 'true',

  /** URL base del archivo, sin barra final. Ej: http://localhost:8080/dcm4chee-arc */
  baseUrl: env('DCM4CHEE_BASE_URL', 'http://localhost:8080/dcm4chee-arc').replace(/\/+$/, ''),

  /** AE Title del archivo: pacientes, estudios (QIDO/WADO), MPPS. */
  aet: env('DCM4CHEE_AET', 'DCM4CHEE'),

  /**
   * AE Title de la aplicacion web que expone la Modality Worklist.
   *
   * No es el mismo que el del archivo, y esto no es evidente: DCM4CHEE bindea
   * la clase de servicio MWL_RS a una web application aparte, llamada WORKLIST
   * por defecto. Consultar /aets/DCM4CHEE/rs/mwlitems devuelve
   *   404 {"errorMessage":"No Web Application with MWL_RS service class found
   *        for Application Entity: DCM4CHEE"}
   * Verificado contra dcm4chee-arc-psql 5.35.1. La lista real de aplicaciones
   * web de un servidor se consulta en GET {baseUrl}/webapps.
   */
  mwlAet: env('DCM4CHEE_MWL_AET', 'WORKLIST'),

  /** none | bearer — 'bearer' usa DCM4CHEE_TOKEN o Keycloak client_credentials. */
  authMode: env('DCM4CHEE_AUTH_MODE', 'none'),
  staticToken: env('DCM4CHEE_TOKEN', ''),
  keycloak: {
    tokenUrl: env('KEYCLOAK_TOKEN_URL', ''),
    clientId: env('KEYCLOAK_CLIENT_ID', ''),
    clientSecret: env('KEYCLOAK_CLIENT_SECRET', ''),
  },

  /** Timeout por request HTTP hacia DCM4CHEE, en ms. */
  httpTimeoutMs: parseInt(env('DCM4CHEE_TIMEOUT_MS', '10000'), 10),

  /**
   * Raiz OID para generar Study Instance UID.
   * '2.25.' es la raiz derivada de UUID que define DICOM PS3.5 B.2 y no
   * requiere registrar un OID propio ante ninguna autoridad.
   */
  uidRoot: env('MWL_UID_ROOT', '2.25.'),

  /** Reintentos del worker antes de marcar la orden en ERROR. */
  maxRetries: parseInt(env('MWL_MAX_RETRIES', '6'), 10),

  /** Backoff exponencial en segundos (seccion 5.3 del documento). */
  backoffSeconds: (env('MWL_BACKOFF_SECONDS', '5,30,120,600,1800,3600') || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0),

  /** Cada cuanto el worker busca trabajo pendiente en el outbox, en ms. */
  workerIntervalMs: parseInt(env('MWL_WORKER_INTERVAL_MS', '5000'), 10),

  /** Cuantos registros del outbox procesa por ciclo. */
  workerBatchSize: parseInt(env('MWL_WORKER_BATCH_SIZE', '10'), 10),

  /** Cada cuanto corre la reconciliacion RIS vs DCM4CHEE, en ms (0 = apagada). */
  reconciliationIntervalMs: parseInt(env('MWL_RECONCILIATION_INTERVAL_MS', '900000'), 10),

  // ── Etapa 2: MPPS (Modality Performed Procedure Step) ────────────────────
  // El equipo avisa al PACS cuando empieza (N-CREATE) y cuando termina (N-SET)
  // el estudio. DCM4CHEE solo lo expone para consulta, asi que el adapter lo
  // consulta periodicamente y actualiza el estado de la orden en el RIS.
  // Sin esto, el personal tiene que marcar a mano "en equipo" y "terminado".

  /** Interruptor propio: se puede tener MWL sin MPPS. */
  mppsEnabled: env('MPPS_ENABLED', 'false') === 'true',

  /** Cada cuanto se consulta el estado de los estudios en curso, en ms. */
  mppsPollIntervalMs: parseInt(env('MPPS_POLL_INTERVAL_MS', '60000'), 10),

  /**
   * Cuantas horas hacia atras se buscan estudios.
   * Un estudio que el equipo nunca cerro no puede quedar consultandose para
   * siempre: pasado este plazo se deja de mirar y queda para revision manual.
   */
  mppsLookbackHours: parseInt(env('MPPS_LOOKBACK_HOURS', '24'), 10),

  stationAet: stationAetMap(),
};

/** URL base de los servicios REST del archivo (pacientes, estudios, MPPS). */
config.rsBase = `${config.baseUrl}/aets/${config.aet}/rs`;

/** URL base de los servicios REST de Modality Worklist. */
config.mwlBase = `${config.baseUrl}/aets/${config.mwlAet}/rs`;

/**
 * Resuelve el Scheduled Station AE Title para una orden.
 * Prioridad: valor explicito en la orden > mapa por modalidad.
 */
config.resolveStationAet = function resolveStationAet(order) {
  if (order && order.stationAet && String(order.stationAet).trim()) {
    return String(order.stationAet).trim();
  }
  const modality = order && order.modality ? String(order.modality).toUpperCase() : '';
  return config.stationAet[modality] || '';
};

module.exports = config;
