const mongoose = require('mongoose');

/** Bitacora de sincronizacion con la worklist (seccion 7.3 del documento). */
const mwlAuditLogSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'RisOrder', index: true },
    accessionNumber: { type: String, required: true, index: true },

    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'RECONCILE'],
      required: true,
    },

    httpStatus: { type: Number, default: null },
    success: { type: Boolean, required: true },

    /** Cuerpo de la respuesta de DCM4CHEE cuando lo hubo (util ante un 400). */
    response: { type: mongoose.Schema.Types.Mixed, default: null },

    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MwlAuditLog', mwlAuditLogSchema);
