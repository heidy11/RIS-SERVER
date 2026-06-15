const mongoose = require('mongoose');

// Sub-schema for each service line in the consultation
const serviceLineSchema = new mongoose.Schema(
  {
    modality:     { type: String },  // DICOM code, e.g. "DX"
    modalityName: { type: String },  // Human-readable name
    serviceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName:  { type: String },
    amount:       { type: Number, default: 0 },  // Price from catalogue
    manualAmount: { type: Number },              // Override amount
    effectiveAmount: { type: Number, default: 0 }, // Final amount paid
  },
  { _id: false }
);

const risOrderSchema = new mongoose.Schema(
  {
    // ── Core scheduling fields ────────────────────────────────────────
    accessionNumber:      { type: String, required: true, unique: true, index: true },
    patient:              { type: mongoose.Schema.Types.ObjectId, ref: 'RisPatient', required: true },
    modality:             { type: String, required: true }, // primary modality, e.g. DX, CT, MR
    procedureDescription: { type: String },
    scheduledDate:        { type: Date, required: true },
    status: {
      type: String,
      enum: ['SCHEDULED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'],
      default: 'SCHEDULED',
    },
    referringPhysician: { type: String }, // Médico derivante
    branch:             { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

    // ── Patient contact / registration fields ─────────────────────────
    patientPhone:      { type: String },  // Teléfono
    patientAge:        { type: Number },  // Edad (puede ser manual)
    observations:      { type: String },  // Observaciones

    // ── Multi-service lines (up to 4) ─────────────────────────────────
    serviceLines: { type: [serviceLineSchema], default: [] },

    // ── Inventory / Consumables used ──────────────────────────────────
    usedConsumables: {
      type: [{
        inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'RisInventory' },
        itemName: { type: String },
        quantity: { type: Number, default: 1 }
      }],
      default: []
    },

    // ── Billing / payment fields ──────────────────────────────────────
    company:           { type: String },   // Empresa / Empleador
    hasInsurance:      { type: Boolean, default: false },
    insuranceName:     { type: String },
    requiresInvoice:   { type: Boolean, default: false },
    invoiceNumber:     { type: String },
    directAmount:      { type: Number, default: 0 }, // Monto Directo (override total)

    // Payment summary
    totalAmount:       { type: Number, default: 0 }, // Sum of effectiveAmount lines
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PARTIAL', 'PAID', 'WAIVED'],
      default: 'PENDING',
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'TRANSFER', 'INSURANCE', 'OTHER', ''],
      default: '',
    },
    paymentNotes: { type: String },
    paidAt:        { type: Date },

    // ── Teaching File / Docencia ───────────────────────────────────
    isTeachingFile:   { type: Boolean, default: false },
    teachingKeywords: { type: [String], default: [] },
    teachingNotes:    { type: String, default: '' },

    // ── Totem / Self-check-in ─────────────────────────────────────
    consentSignature:  { type: String, default: '' },  // Base64 PNG of signature
    arrivedAt:         { type: Date },                 // Timestamp of kiosk check-in
    consentSignedAt:   { type: Date },                 // Timestamp of consent signing
  },
  { timestamps: true, strict: false }  // strict:false allows legacy documents without new fields
);

module.exports = mongoose.model('RisOrder', risOrderSchema);

