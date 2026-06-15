const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Campo para asegurar que solo exista un documento en esta colección (Singleton Pattern)
    singleton_id: {
      type: Number,
      default: 1,
      unique: true,
      required: true,
    },
    institution_name: {
      type: String,
      required: true,
      trim: true,
      default: 'Nombre de la Institución Principal',
    },
    // Primer logo (Ej. Logo Principal)
    logo_primary_base64: {
      type: String, // Almacenará el logo codificado en Base64
      default: null,
    },
    // Segundo logo (Ej. Logo Secundario/Alterno/Dark Mode)
    logo_secondary_base64: {
      type: String,
      default: null,
    },
    // Metadatos de los logos (opcional)
    primary_logo_filename: {
      type: String,
      default: null,
    },
    secondary_logo_filename: {
      type: String,
      default: null,
    },
    // Window Level Presets configuration
    windowLevelPresets: {
      type: Object, // Usamos Object para flexibilidad { CT: { ... }, PT: { ... } }
      default: {
        CT: {
          1: { description: 'Cerebro', window: '80', level: '40' },
          2: { description: 'Pulmón', window: '1500', level: '-600' },
          3: { description: 'Hueso', window: '2000', level: '300' },
          4: { description: 'Abdomen', window: '400', level: '40' },
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
