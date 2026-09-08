const mongoose = require('mongoose');

/**
 * Outbox de sincronizacion con la Modality Worklist (seccion 5.3 y 7.2 del
 * documento de integracion).
 *
 * Cuando el RIS agenda una orden, no se llama a DCM4CHEE dentro del request:
 * se guarda aqui un registro PENDING y se responde de inmediato. Un worker lo
 * toma despues y lo empuja al PACS con reintentos.
 *
 * El motivo es clinico, no de estilo: si DCM4CHEE se reinicia justo cuando se
 * agenda un TAC de urgencia, sin outbox el paciente simplemente no aparece en
 * la consola del tomografo y nadie se entera hasta que el tecnico llama por
 * telefono. Con outbox, eso es un reintento automatico.
 *
 * El payload DICOM JSON se guarda tal cual se envio, para poder reproducir
 * exactamente que se le mando al PACS cuando haya que diagnosticar un caso.
 */
const mwlOutboxSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'RisOrder', required: true, index: true },

    /** Se duplica desde la orden para poder rastrear sin hacer join. */
    accessionNumber: { type: String, required: true, index: true },

    operation: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      required: true,
    },

    /** Dataset DICOM JSON enviado (null en las operaciones DELETE). */
    payload: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Necesarios para DELETE /mwlitems/{studyUID}/{spsID}. */
    studyInstanceUid: { type: String },
    spsId: { type: String },

    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SYNCED', 'ERROR'],
      default: 'PENDING',
      index: true,
    },

    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: { type: String },

    /** Codigo HTTP de la ultima respuesta de DCM4CHEE, para auditoria. */
    lastHttpStatus: { type: Number },
    syncedAt: { type: Date },
  },
  { timestamps: true }
);

// El worker siempre consulta por status + nextAttemptAt: este indice es el que
// mantiene barato ese barrido cuando el outbox acumula historico.
mwlOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('MwlOutbox', mwlOutboxSchema);
