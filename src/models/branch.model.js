const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    // Relación N:1 con la Organización
    fk_organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization', // Referencia al modelo Organization
      required: true,
    },

    // Identificadores de la Sucursal
    name: {
      type: String,
      required: true,
      trim: true,
    },
    short_name: {
      type: String,
      required: true,
      trim: true,
    },
    oid: {
      type: String,
      required: true,
      unique: true, // Debe ser único a nivel global de sucursales
      trim: true,
    },

    // Metadatos de la Sucursal (similar a Organization)
    country_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    structure_id: {
      type: String,
      required: true,
      trim: true,
    },
    suffix: {
      type: String,
      required: true,
      trim: true,
    },

    // Logotipo
    base64_logo: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt
  }
);

const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
