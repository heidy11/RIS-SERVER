const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre de la organización es obligatorio'],
      trim: true,
    },
    short_name: {
      type: String,
      required: [true, 'El nombre corto es obligatorio'],
      trim: true,
    },
    oid: {
      type: String,
      required: [true, 'El OID es obligatorio'],
      unique: true,
      trim: true,
      // Validación básica de formato OID (números y puntos)
      match: [/^[0-9.]+$/, 'El OID solo puede contener números y puntos'],
    },
    country_code: {
      type: String,
      required: [true, 'El código de país es obligatorio'],
      trim: true,
      uppercase: true,
      minLength: [2, 'El código de país debe tener al menos 2 caracteres'],
      maxLength: [3, 'El código de país no puede tener más de 3 caracteres'],
    },
    structure_id: {
      type: String,
      required: [true, 'El ID de estructura es obligatorio'],
      trim: true,
    },
    suffix: {
      type: String,
      required: [true, 'El sufijo es obligatorio'],
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    base64_logo: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
