const mongoose = require('mongoose');

// Preprogramación del laboratorio (CNS): el paciente llega a caja con su boleta y se
// lo anota para un DÍA (sin hora) con lo mínimo: nombre, matrícula, celular y exámenes
// (hoja "Registro diario de programación de pacientes", CNS - CVT REGPRG-001). El
// registro formal del paciente se hace recién el día que viene, porque muchos no vuelven.
const risPreprogramacionSchema = new mongoose.Schema(
  {
    fechaExamen: { type: String, required: true, index: true }, // "AAAA-MM-DD": día programado

    nombreCompleto: { type: String, required: true, trim: true }, // NOMBRE Y APELLIDO
    matricula: { type: String, required: true, trim: true, index: true }, // MATRÍCULA (N.º de asegurado)
    celular: { type: String, required: true, trim: true },

    examenes: { type: [String], default: [] }, // claves de EXAMENES_LAB (ver controlador)

    // EMERGENCIA: vino ese mismo día con su boleta; se registra y se atiende en el día
    emergencia: { type: Boolean, default: false },

    // FIRMA ENTREGA: se marca al entregar los resultados
    entregado: { type: Boolean, default: false },
    entregadoEl: { type: Date },
    entregadoPor: { type: String },

    estado: {
      type: String,
      enum: ['PROGRAMADO', 'ASISTIO', 'NO_VINO'],
      default: 'PROGRAMADO',
      index: true,
    },
    paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'RisPatient' }, // al registrarlo formalmente
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    creadoPor: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisPreprogramacion', risPreprogramacionSchema);
