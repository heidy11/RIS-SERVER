const mongoose = require('mongoose');

const modalitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Nombre de la modalidad único
    },
    dicom_code: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true, // Código DICOM (ej. CT, MR, DX)
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Modality = mongoose.model('Modality', modalitySchema);

module.exports = Modality;
