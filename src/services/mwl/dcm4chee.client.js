/**
 * Cliente HTTP hacia los servicios REST de DCM4CHEE (seccion 10 del documento).
 *
 * Solo cubre lo que el adapter necesita: crear/actualizar/borrar entradas de
 * Modality Worklist y consultarlas para la reconciliacion. Deliberadamente no
 * expone nada de administracion del archivo, en linea con el principio de
 * minimo privilegio de la seccion 18.
 *
 * Ojo con las dos bases distintas, verificado contra dcm4chee-arc-psql 5.35.1:
 *
 *   {baseUrl}/aets/{DCM4CHEE_AET}/rs      -> pacientes, estudios, MPPS
 *   {baseUrl}/aets/{DCM4CHEE_MWL_AET}/rs  -> mwlitems (clase de servicio MWL_RS)
 *
 * Rutas usadas:
 *   POST   /rs/patients                       alta/actualizacion del paciente
 *   POST   /rs/mwlitems                       crear o actualizar un SPS (upsert)
 *   DELETE /rs/mwlitems/{studyUID}/{spsID}    retirar un SPS de la worklist
 *   GET    /rs/mwlitems                       listar entradas (reconciliacion)
 *   GET    /rs/mwlitems/count                 conteo (health check)
 */

const axios = require('axios');
const config = require('./mwl.config');

/**
 * Error de transporte hacia DCM4CHEE con la informacion que el worker necesita
 * para decidir si reintentar o rendirse.
 */
class Dcm4cheeError extends Error {
  constructor(message, { status = null, body = null, retryable = true } = {}) {
    super(message);
    this.name = 'Dcm4cheeError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

// ── Autenticacion saliente ───────────────────────────────────────────────────

let cachedToken = null; // { value, expiresAt }

/**
 * Obtiene un token Bearer para DCM4CHEE.
 *
 * Soporta un token estatico (util para pruebas) y OAuth2 client_credentials
 * contra Keycloak. El token se cachea y se renueva 30 s antes de vencer, para
 * no pedir uno nuevo en cada entrada de worklist.
 */
async function getAuthToken() {
  if (config.authMode !== 'bearer') return null;
  if (config.staticToken) return config.staticToken;

  const { tokenUrl, clientId, clientSecret } = config.keycloak;
  if (!tokenUrl || !clientId) {
    throw new Dcm4cheeError(
      'DCM4CHEE_AUTH_MODE=bearer pero falta KEYCLOAK_TOKEN_URL o KEYCLOAK_CLIENT_ID',
      { retryable: false }
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const res = await axios.post(tokenUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: config.httpTimeoutMs,
    });
    const expiresInMs = ((res.data.expires_in || 60) - 30) * 1000;
    cachedToken = { value: res.data.access_token, expiresAt: Date.now() + expiresInMs };
    return cachedToken.value;
  } catch (err) {
    cachedToken = null;
    throw new Dcm4cheeError(`No se pudo obtener token de Keycloak: ${describeAxiosError(err)}`, {
      status: err.response ? err.response.status : null,
      retryable: true,
    });
  }
}

/** Invalida el token cacheado; el worker lo llama al recibir 401/403. */
function invalidateToken() {
  cachedToken = null;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function describeAxiosError(err) {
  if (err.response) {
    const body =
      typeof err.response.data === 'string'
        ? err.response.data.slice(0, 500)
        : JSON.stringify(err.response.data || {}).slice(0, 500);
    return `HTTP ${err.response.status} ${err.response.statusText || ''} ${body}`.trim();
  }
  if (err.code === 'ECONNABORTED') return `timeout tras ${config.httpTimeoutMs} ms`;
  return err.code ? `${err.code} ${err.message}` : err.message;
}

/**
 * Decide si vale la pena reintentar.
 *
 * Un 400 significa que el DICOM JSON esta mal construido: reintentarlo solo
 * consume la cola y retrasa la alerta. Segun la seccion 10.3 esos casos deben
 * fallar de inmediato y avisar, porque son bugs de mapeo, no fallas de red.
 */
function isRetryable(status) {
  if (status === null || status === undefined) return true; // red caida / timeout
  if (status === 401 || status === 403) return true; // token vencido: se refresca
  if (status === 409 || status === 429) return true;
  return status >= 500;
}

async function requestWithAuth(options) {
  const token = await getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await axios({ ...options, headers, timeout: config.httpTimeoutMs });
  } catch (err) {
    const status = err.response ? err.response.status : null;
    if (status === 401 || status === 403) invalidateToken();
    throw new Dcm4cheeError(describeAxiosError(err), {
      status,
      body: err.response ? err.response.data : null,
      retryable: isRetryable(status),
    });
  }
}

// ── Operaciones MWL ──────────────────────────────────────────────────────────

/**
 * Da de alta (o actualiza) el paciente en el archivo.
 *
 * Es un paso obligatorio previo a crear la entrada MWL, y el documento de
 * integracion no lo menciona: DCM4CHEE rechaza el POST a /mwlitems con
 *   404 {"errorMessage":"Patient[id=[TESTCT001]] does not exist."}
 * si el paciente no existe todavia en el archivo.
 *
 * La operacion es idempotente: repetirla con el mismo Patient ID actualiza los
 * datos demograficos y devuelve 200, no crea un duplicado.
 *
 * @param {object} patientDataset DICOM JSON con los tags del grupo 0010
 */
async function createOrUpdatePatient(patientDataset) {
  const res = await requestWithAuth({
    method: 'POST',
    url: `${config.rsBase}/patients`,
    data: patientDataset,
    headers: { 'Content-Type': 'application/dicom+json' },
  });
  return { status: res.status, data: res.data };
}

/**
 * Crea o actualiza una entrada de worklist.
 *
 * DCM4CHEE trata este POST como upsert por Study Instance UID + SPS ID, asi
 * que la misma llamada sirve para agendar y para reprogramar (seccion 6.3).
 *
 * @param {object} dataset dataset DICOM JSON producido por dicomMwl.mapper
 * @returns {Promise<{status:number, data:any}>}
 */
async function createOrUpdateMwlItem(dataset) {
  const res = await requestWithAuth({
    method: 'POST',
    url: `${config.mwlBase}/mwlitems`,
    data: dataset,
    headers: { 'Content-Type': 'application/dicom+json' },
  });
  return { status: res.status, data: res.data };
}

/**
 * Retira un Scheduled Procedure Step de la worklist activa.
 * Un 404 se considera exito: el objetivo (que no este en la worklist) ya se
 * cumple, y tratarlo como error dejaria la cancelacion reintentando para siempre.
 */
async function deleteMwlItem(studyInstanceUid, spsId) {
  try {
    const res = await requestWithAuth({
      method: 'DELETE',
      url: `${config.mwlBase}/mwlitems/${encodeURIComponent(studyInstanceUid)}/${encodeURIComponent(spsId)}`,
    });
    return { status: res.status, alreadyAbsent: false };
  } catch (err) {
    if (err instanceof Dcm4cheeError && err.status === 404) {
      return { status: 404, alreadyAbsent: true };
    }
    throw err;
  }
}

/**
 * Lista entradas de worklist. Usado por la reconciliacion.
 * @param {object} params filtros QIDO (p.ej. {'00400100.00080060': 'CT'})
 */
async function searchMwlItems(params = {}, limit = 500) {
  const res = await requestWithAuth({
    method: 'GET',
    url: `${config.mwlBase}/mwlitems`,
    params: { ...params, limit, includefield: 'all' },
  });
  // DCM4CHEE responde 204 sin cuerpo cuando no hay coincidencias.
  return res.status === 204 ? [] : res.data || [];
}

/**
 * Consulta los Modality Performed Procedure Step del archivo (Etapa 2).
 *
 * MPPS lo crea y actualiza el propio equipo medico por DIMSE: N-CREATE al
 * iniciar el estudio y N-SET al terminarlo. Ni el RIS ni el adapter lo
 * escriben; DCM4CHEE solo lo expone para consulta.
 *
 * @param {object} params filtros (p.ej. {StudyInstanceUID: '2.25...'})
 */
async function searchMpps(params = {}, limit = 500) {
  const res = await requestWithAuth({
    method: 'GET',
    url: `${config.rsBase}/mpps`,
    params: { ...params, limit, includefield: 'all' },
  });
  return res.status === 204 ? [] : res.data || [];
}

/** Conteo de entradas de worklist; sirve tambien como health check del archivo. */
async function countMwlItems(params = {}) {
  const res = await requestWithAuth({
    method: 'GET',
    url: `${config.mwlBase}/mwlitems/count`,
    params,
  });
  return res.data && res.data.count !== undefined ? res.data.count : 0;
}

/**
 * Comprueba conectividad y autenticacion contra DCM4CHEE.
 * @returns {Promise<{ok:boolean, rsBase:string, count?:number, error?:string}>}
 */
async function healthCheck() {
  try {
    const count = await countMwlItems();
    return { ok: true, archiveBase: config.rsBase, mwlBase: config.mwlBase, count };
  } catch (err) {
    return { ok: false, archiveBase: config.rsBase, mwlBase: config.mwlBase, error: err.message };
  }
}

module.exports = {
  createOrUpdatePatient,
  createOrUpdateMwlItem,
  deleteMwlItem,
  searchMwlItems,
  searchMpps,
  countMwlItems,
  healthCheck,
  invalidateToken,
  Dcm4cheeError,
};
