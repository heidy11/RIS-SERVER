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

    // ── Identidad DICOM en la red ──────────────────────────────────
    // Estos datos salen del DICOM Conformance Statement de cada equipo.
    // No deben asumirse: si el AE Title no coincide exactamente (distingue
    // mayúsculas), el equipo no encuentra su propia worklist y la consola
    // aparece vacía sin mostrar ningún mensaje de error.

    // Scheduled Station AE Title (0040,0001). Es el nombre con el que el
    // equipo se identifica en la red DICOM. Máximo 16 caracteres (VR "AE").
    aeTitle: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 16,
      index: true,
    },

    // Dirección y puerto DICOM del equipo. Se usan para registrarlo en el
    // PACS y para probar la conectividad (C-ECHO) antes de la puesta en marcha.
    ipAddress:  { type: String, trim: true },
    dicomPort:  { type: Number, default: 104 },

    // Código DICOM de modalidad que reporta el equipo: CT, DX, CR, US, MR…
    // Ojo con los equipos de rayos X: los de placa computarizada reportan CR
    // y los de detector digital DX. Confirmar por equipo, no asumir.
    modality: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    // Si el equipo implementa Modality Worklist SCU (consulta la lista de
    // trabajo). Los que no lo soportan requieren carga manual del paciente.
    supportsMwl: { type: Boolean, default: true },

    // Notas del Conformance Statement: versión, particularidades, qué se probó.
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
