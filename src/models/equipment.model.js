const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Asumimos que el nombre del equipo es único
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    serial_number: {
      type: String,
      trim: true,
    },
    status: {
      type: Boolean,
      default: true, // Activo/Inactivo
    },
aeTitle: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 16,
      index: true,
    },
ipAddress:  { type: String, trim: true },
    dicomPort:  { type: Number, default: 104 },

    modality: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    supportsMwl: { type: Boolean, default: true },

    conformanceNotes: { type: String, default: '' },

    // ── Preventive Maintenance fields ──────────────────────────────
    lastMaintenanceDate: { type: Date },
    nextMaintenanceDate: { type: Date },
    maintenanceIntervalDays: { type: Number, default: 90 }, // default every 3 months
    maintenanceNotes: { type: String, default: '' },
    maintenanceHistory: {
      type: [{
        date: { type: Date, required: true },
        description: { type: String },
        technician: { type: String },
        cost: { type: Number, default: 0 },
      }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Equipment = mongoose.model('Equipment', equipmentSchema);

module.exports = Equipment;
