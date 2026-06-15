const mongoose = require('mongoose');

const risReportSchema = new mongoose.Schema(
  {
    studyInstanceUid: { type: String, required: true, unique: true, index: true }, // Enlace DICOM dcm4chee
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'RisOrder' }, // Puede ser opcional si el reporte se hace ad-hoc
    radiologist: { type: String }, // User ID del Médico radiólogo
    contentHtml: { type: String, default: '' }, // Contenido WYSIWYG del informe
    status: { type: String, enum: ['DRAFT', 'SIGNED'], default: 'DRAFT' },
    signedAt: { type: Date },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // Multi-tenant center

    // ── Teaching File / Docencia ──────────────────────────────────
    isTeachingFile:   { type: Boolean, default: false },
    teachingKeywords: { type: [String], default: [] },
    teachingNotes:    { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisReport', risReportSchema);
