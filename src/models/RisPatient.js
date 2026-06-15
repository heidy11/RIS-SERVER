const mongoose = require('mongoose');

const risPatientSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true }, // ID PACS / MRN
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['M', 'F', 'O', 'U'] },
    documentId: { type: String }, // CI / DNI
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    contactInfo: { type: String },
    allergies: { type: String, default: '' },
    clinicalNotes: { type: String, default: '' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // Multi-tenant center
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisPatient', risPatientSchema);
