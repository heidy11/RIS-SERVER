const mongoose = require('mongoose');

/** Outbox de sincronizacion con la Modality Worklist (seccion 5.3 y 7.2 del documento de integracion). */
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

// El worker siempre consulta por status + nextAttemptAt: este indice es el que mantiene barato ese barrido cuando el outbox acumula historico.
mwlOutboxSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('MwlOutbox', mwlOutboxSchema);
