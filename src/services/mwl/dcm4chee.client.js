/** Cliente HTTP hacia los servicios REST de DCM4CHEE (seccion 10 del documento). */

const axios = require('axios');
const config = require('./mwl.config');

/** Error de transporte hacia DCM4CHEE con la informacion que el worker necesita para decidir si reintentar o rendirse. */
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

/** Obtiene un token Bearer para DCM4CHEE. Soporta un token estatico (util para pruebas) y OAuth2 client_credentials contra Keycloak. */
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

/** Decide si vale la pena reintentar. */
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

/** Retira un Scheduled Procedure Step de la worklist activa. */
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
 * Lista entradas de worklist.
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
