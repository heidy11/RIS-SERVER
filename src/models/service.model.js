const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    // Relación N:1 con la Sucursal
    fk_branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    // Relación N:1 con la Modalidad
    fk_modality: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Modality',
      required: true,
    },
    // Relación N:M con Equipos
    fk_equipments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Equipment',
      },
    ],

    // Datos del Servicio
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      default: 0
    },
    // Digital acquisition protocol — instructions for the technician
    protocolDescription: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    calendar_settings: {
      // Objeto para configuración específica del calendario (ej. duración predeterminada)
      default_duration_min: { type: Number, default: 30 }, // Duración en minutos
      max_patients_per_slot: { type: Number, default: 1 }, // Máximo de pacientes
      // Otros: buffer_time, working_hours_ref...
    },
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para asegurar que no haya dos servicios con el mismo nombre en la misma sucursal
serviceSchema.index({ name: 1, fk_branch: 1 }, { unique: true });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
