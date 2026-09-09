/**
 * Generacion de Study Instance UID segun DICOM PS3.5 anexo B.2: la raiz
 * 2.25.<entero>, donde <entero> es un UUID v4 como numero de 128 bits en
 * decimal. Es la unica forma de emitir UIDs unicos sin registrar un OID propio.
 */

const crypto = require('crypto');
const config = require('./mwl.config');

/** Longitud maxima de un UID segun el VR "UI" de DICOM. */
const MAX_UID_LENGTH = 64;

function uuidToDecimal(uuid) {
  return BigInt('0x' + uuid.replace(/-/g, '')).toString(10);
}

function generateStudyInstanceUid() {
  const uid = `${config.uidRoot}${uuidToDecimal(crypto.randomUUID())}`;
  if (uid.length > MAX_UID_LENGTH) {
    throw new Error(
      `El Study Instance UID generado excede ${MAX_UID_LENGTH} caracteres (${uid.length}). ` +
        `Revisar MWL_UID_ROOT="${config.uidRoot}".`
    );
  }
  return uid;
}

/** Componentes numericos separados por puntos, sin ceros a la izquierda. */
function isValidUid(uid) {
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > MAX_UID_LENGTH) return false;
  return /^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/.test(uid);
}

module.exports = { generateStudyInstanceUid, isValidUid, uuidToDecimal, MAX_UID_LENGTH };
