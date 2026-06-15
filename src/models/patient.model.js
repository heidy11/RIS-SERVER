const mongoose = require('mongoose');

// Definición de los géneros permitidos para asegurar consistencia
const GENDER_OPTIONS = ['MASCULINO', 'FEMENINO', 'OTRO', 'NO_ESPECIFICADO'];

const patientSchema = new mongoose.Schema(
  {
    // Datos Obligatorios y de Identificación
    patientId: {
      // Código único ingresado por el usuario (ej: número de expediente)
      type: String,
      required: true,
      unique: true, // Asegura que no haya dos pacientes con el mismo patientId
      trim: true,
      uppercase: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    // Datos Adicionales Solicitados
    gender: {
      type: String,
      required: true,
      enum: GENDER_OPTIONS, // Restringe los valores a las opciones predefinidas
    },
    dateOfBirth: {
      // Cumpleaños
      type: Date,
      required: true,
    },

    // Otros Datos Adicionales Comunes
    phoneNumber: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    notes: {
      // Para información clínica adicional
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

const Patient = mongoose.model('Patient', patientSchema);

module.exports = Patient;
