const mongoose = require('mongoose');

const STATUS_OPTIONS = ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA'];
const TYPE_OPTIONS = [
  'CONSULTA',
  'RAYOS X',
  'TOMOGRAFIA',
  'RESONANCIA',
  'ULTRASONIDO',
  'MAMOGRAFIA',
  'SEGUIMIENTO',
];

const appointmentSchema = new mongoose.Schema(
  {
    // Referencia al Paciente
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient', // Referencia al modelo Patient
      required: true,
    },
    patientIdCode: {
      // Almacenar el patientId (código de usuario) para facilitar la búsqueda sin populate
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // Detalles de la Cita
    date: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: TYPE_OPTIONS,
      default: 'CONSULTA',
      required: true,
    },
    status: {
      type: String,
      enum: STATUS_OPTIONS,
      default: 'PENDIENTE',
      required: true,
    },

    // Información Adicional
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      // Usuario que agenda la cita
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para prevenir duplicados:
// Asegura que no se puedan agendar dos citas para el mismo paciente en el mismo momento (si la precisión del minuto es suficiente)
appointmentSchema.index({ patient: 1, date: 1 }, { unique: true });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
