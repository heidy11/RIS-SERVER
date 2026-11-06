const mongoose = require('mongoose');

// Informe de laboratorio (una visita de un paciente con uno o varios estudios).
// Antes vivía solo en el navegador (localStorage 'ris_historial_cns'); el frontend sigue
// usando la misma forma del registro, por eso los campos que no están aquí se guardan
// igual (strict: false) y `informeId` es el `id` que arma el frontend.
const risInformeLabSchema = new mongoose.Schema(
  {
    informeId: { type: String, required: true, unique: true, index: true },
    cod: { type: String, trim: true, index: true }, // matrícula
    paciente: { type: String, trim: true },
    id_paciente: { type: String },
    fecha: { type: String, index: true }, // AAAA-MM-DD
    estado: { type: String, enum: ['BORRADOR', 'COMPLETADO', 'FIRMADO'], default: 'COMPLETADO', index: true },
    estudiosRealizados: { type: [String], default: [] },
    datos: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Carga masiva desde la planilla Excel: de qué archivo y fila salió, y el lote
    // (para poder quitar una carga completa si hace falta)
    origen: {
      tipo: { type: String }, // 'excel'
      archivo: { type: String },
      hoja: { type: String },
      fila: { type: Number },
      lote: { type: String, index: true },
    },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    creadoPor: { type: String },
    modificadoPor: { type: String },
  },
  { timestamps: true, strict: false, minimize: false }
);

module.exports = mongoose.model('RisInformeLab', risInformeLabSchema);
