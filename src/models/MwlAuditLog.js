const mongoose = require('mongoose');

/**
 * Bitacora de sincronizacion con la worklist (seccion 7.3 del documento).
 *
 * Registra cada intento contra DCM4CHEE, exitoso o no. No es lo mismo que el
 * outbox: el outbox guarda el trabajo pendiente y se limpia, esto guarda la
 * historia. Sirve para responder despues la pregunta que siempre aparece en
 * soporte: "el paciente no salio en el tomografo, que le mandamos al PACS y
 * cuando".
 *
 * La retencion debe seguir la politica de registros clinicos del hospital, no
 * la ventana de reintentos (seccion 18).
 */
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
