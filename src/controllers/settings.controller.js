const Settings = require('../models/settings.model.js');

// Helper para obtener el documento único o crearlo
const getOrCreateSettings = async () => {
  let settings = await Settings.findOne({ singleton_id: 1 });
  if (!settings) {
    settings = await Settings.create({});
  } else if (!settings.windowLevelPresets) {
    // Backfill default if missing in existing doc
    settings.windowLevelPresets = {
      CT: {
        1: { description: 'Cerebro', window: '80', level: '40' },
        2: { description: 'Pulmón', window: '1500', level: '-600' },
        3: { description: 'Hueso', window: '2000', level: '300' },
        4: { description: 'Abdomen', window: '400', level: '40' },
      },
    };
    await settings.save();
  }
  return settings;
};

// --- Función READ: Obtener la configuración (siempre un solo documento) ---
exports.getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener la configuración',
      error: error.message,
    });
  }
};

// --- Función UPDATE: Crear o actualizar la configuración ---
exports.updateSettings = async (req, res) => {
  try {
    const {
      institution_name,
      logo_primary_base64,
      logo_secondary_base64,
      primary_logo_filename,
      secondary_logo_filename,
      windowLevelPresets, // Nuevo campo
    } = req.body;

    // Utilizamos findOneAndUpdate con la opción upsert: true para crear si no existe
    const updatedSettings = await Settings.findOneAndUpdate(
      { singleton_id: 1 }, // Criterio de búsqueda para el único documento
      {
        institution_name,
        logo_primary_base64,
        logo_secondary_base64,
        primary_logo_filename,
        secondary_logo_filename,
        windowLevelPresets, // Actualizamos el campo
      },
      { new: true, upsert: true, runValidators: true } // new: devuelve el documento actualizado, upsert: crea si no existe
    );

    res.status(200).json({
      message: 'Configuración de la institución actualizada exitosamente',
      settings: updatedSettings,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar la configuración',
      error: error.message,
    });
  }
};

// --- Función DELETE (Opcional, generalmente no se borra la configuración global) ---
// La omitiremos por simplicidad y seguridad.
