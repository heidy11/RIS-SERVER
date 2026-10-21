const mongoose = require('mongoose');

const risPatientSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true }, // ID PACS / MRN
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['M', 'F', 'O', 'U'] },
    documentId: { type: String }, // CI / DNI
    // Seguro (CNS): el formulario de admisión los pedía, pero sin estos campos Mongo los
    // descartaba. La matrícula identifica al paciente que vuelve desde la Preprogramación.
    numeroAsegurado: { type: String, trim: true, uppercase: true, index: true }, // Matrícula (AVC del Excel)
    codigoBeneficiario: { type: String, trim: true }, // BENEF.
    // Columnas del Excel del laboratorio: apellidos por separado y edad (no piden fecha de nacimiento).
    // firstName/lastName se siguen llenando (NOMBRES / PATERNO + MATERNO) para el resto del sistema.
    apellidoPaterno: { type: String, trim: true },
    apellidoMaterno: { type: String, trim: true },
    edad: { type: Number },
    // Datos de la visita con la que se registró (EMERGENCIA, CONSULTORIO, MÉDICO, FECHAS)
    ultimaAdmision: {
      emergencia: { type: Boolean, default: false },
      consultorio: { type: String, trim: true },
      medico: { type: String, trim: true },
      fechaSolicitud: { type: String }, // AAAA-MM-DD
      fechaMuestra: { type: String },
      fechaExamen: { type: String },
    },
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
