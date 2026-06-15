const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    // Define el dominio jerárquico al que pertenece este slot
    domain: {
      organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
      },
      branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
      },
      // También podríamos incluir la Modalidad o Servicio principal si fuera necesario
    },

    // Referencias al equipo y al servicio
    fk_equipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Equipment',
      required: true,
    },
    fk_service: { // Usamos fk_service en lugar de fk_procedure
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },

    // Tiempo del slot
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
      validate: {
        validator: function(value) {
          return value > this.start;
        },
        message: 'La hora de fin debe ser posterior a la hora de inicio.',
      },
    },

    // Indicador de estado y urgencia
    urgency: {
      type: Boolean,
      default: false,
    },
    is_available: {
        type: Boolean,
        default: true, // Indica si el slot está libre para ser reservado (por una cita)
    }
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para asegurar que un equipo no se programe en dos lugares a la vez.
// Esto ayuda a prevenir la sobreprogramación del equipo.
slotSchema.index({ fk_equipment: 1, start: 1, end: 1 }, { unique: true });

const Slot = mongoose.model('Slot', slotSchema);

module.exports = Slot;
