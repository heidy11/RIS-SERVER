/**
 * Generacion de Study Instance UID.
 *
 * DICOM PS3.5 anexo B.2 define la raiz 2.25.<entero>, donde <entero> es un
 * UUID version 4 interpretado como numero de 128 bits en decimal. Es la unica
 * forma de emitir UIDs globalmente unicos sin registrar un arco OID propio,
 * y es la que recomienda el documento de integracion (variable UID_ROOT).
 *
 * El UID debe generarse UNA sola vez por orden y no cambiar nunca: es el hilo
 * que une RIS -> MWL -> equipo -> PACS -> OHIF. Si se regenera al reprogramar,
 * el estudio adquirido queda huerfano respecto de la orden del RIS.
 */

const crypto = require('crypto');
const config = require('./mwl.config');

/** Longitud maxima de un UID segun el VR "UI" de DICOM. */
const MAX_UID_LENGTH = 64;

/**
 * Convierte un UUID v4 al entero decimal de 128 bits que exige PS3.5 B.2.
 * @param {string} uuid UUID con guiones
 * @returns {string} representacion decimal sin ceros a la izquierda
 */
function uuidToDecimal(uuid) {
  return BigInt('0x' + uuid.replace(/-/g, '')).toString(10);
}

/**
 * Genera un Study Instance UID nuevo.
 * @returns {string}
 */
function generateStudyInstanceUid() {
  const uid = `${config.uidRoot}${uuidToDecimal(crypto.randomUUID())}`;
  if (uid.length > MAX_UID_LENGTH) {
    // Con la raiz 2.25. el maximo teorico es 5 + 39 = 44 caracteres, asi que
    // esto solo puede dispararse si alguien configura una UID_ROOT larguisima.
    throw new Error(
      `El Study Instance UID generado excede ${MAX_UID_LENGTH} caracteres (${uid.length}). ` +
        `Revisar MWL_UID_ROOT="${config.uidRoot}".`
    );
  }
  return uid;
}

/**
 * Valida el formato de un UID DICOM: componentes numericos separados por
 * puntos, sin ceros a la izquierda, maximo 64 caracteres.
 * @param {string} uid
 * @returns {boolean}
 */
function isValidUid(uid) {
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > MAX_UID_LENGTH) return false;
  return /^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/.test(uid);
}

module.exports = { generateStudyInstanceUid, isValidUid, uuidToDecimal, MAX_UID_LENGTH };
