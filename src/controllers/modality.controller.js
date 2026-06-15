const Modality = require('../models/modality.model.js');

// --- Función CREATE: Crear una nueva modalidad ---
exports.createModality = async (req, res) => {
  try {
    const { name, dicom_code, description, status } = req.body;

    // 1. Validación de campos requeridos
    if (!name || !dicom_code) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes: nombre y código DICOM.' });
    }

    // 2. Crear nueva modalidad
    const newModality = new Modality({
      name,
      dicom_code,
      description,
      status,
    });

    await newModality.save();

    res.status(201).json({
      message: 'Modalidad creada exitosamente',
      modality: newModality,
    });
  } catch (error) {
    console.error('Error al crear la modalidad:', error);

    // Manejo de error específico si el nombre o dicom_code ya existe (unique: true)
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Ya existe una modalidad con ese nombre o código DICOM.',
      });
    }

    res.status(500).json({
      message: 'Error interno al crear la modalidad',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todas las modalidades ---
exports.getAllModalities = async (req, res) => {
  try {
    const modalities = await Modality.find().sort({ name: 1 });
    res.status(200).json(modalities);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las modalidades', error: error.message });
  }
};

// --- Función READ: Obtener una modalidad por ID ---
exports.getModalityById = async (req, res) => {
  try {
    const modality = await Modality.findById(req.params.id);
    if (!modality) {
      return res.status(404).json({ message: 'Modalidad no encontrada' });
    }
    res.status(200).json(modality);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la modalidad', error: error.message });
  }
};

// --- Función UPDATE: Actualizar una modalidad (PATCH) ---
exports.updateModality = async (req, res) => {
  try {
    const updatedModality = await Modality.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedModality) {
      return res.status(404).json({ message: 'Modalidad no encontrada' });
    }

    res.status(200).json({
      message: 'Modalidad actualizada exitosamente',
      modality: updatedModality,
    });
  } catch (error) {
    console.error('Error al actualizar la modalidad:', error);
     if (error.code === 11000) {
      return res.status(409).json({
        message: 'El nombre o código DICOM ya está en uso.',
      });
    }
    res.status(500).json({ message: 'Error al actualizar la modalidad', error: error.message });
  }
};

// --- Función DELETE: Eliminar una modalidad ---
exports.deleteModality = async (req, res) => {
  try {
    const deletedModality = await Modality.findByIdAndDelete(req.params.id);
    if (!deletedModality) {
      return res.status(404).json({ message: 'Modalidad no encontrada' });
    }
    res.status(200).json({ message: 'Modalidad eliminada exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la modalidad', error: error.message });
  }
};
