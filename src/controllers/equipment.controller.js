const Equipment = require('../models/equipment.model.js');

// --- Función CREATE: Crear un nuevo equipo ---
exports.createEquipment = async (req, res) => {
  try {
    const { name, manufacturer, model, serial_number, status } = req.body;

    // 1. Validación de campos requeridos
    if (!name) {
      return res.status(400).json({ message: 'El nombre del equipo es obligatorio.' });
    }

    // 2. Crear nuevo equipo
    const newEquipment = new Equipment({
      name,
      manufacturer,
      model,
      serial_number,
      status,
    });

    await newEquipment.save();

    res.status(201).json({
      message: 'Equipo creado exitosamente',
      equipment: newEquipment,
    });
  } catch (error) {
    console.error('Error al crear el equipo:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Ya existe un equipo con ese nombre.',
      });
    }

    res.status(500).json({
      message: 'Error interno al crear el equipo',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todos los equipos ---
exports.getAllEquipments = async (req, res) => {
  try {
    const equipments = await Equipment.find().sort({ name: 1 });
    res.status(200).json(equipments);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los equipos', error: error.message });
  }
};

// --- Función READ: Obtener un equipo por ID ---
exports.getEquipmentById = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }
    res.status(200).json(equipment);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el equipo', error: error.message });
  }
};

// --- Función UPDATE: Actualizar un equipo (PATCH) ---
exports.updateEquipment = async (req, res) => {
  try {
    const updatedEquipment = await Equipment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedEquipment) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }

    res.status(200).json({
      message: 'Equipo actualizado exitosamente',
      equipment: updatedEquipment,
    });
  } catch (error) {
    console.error('Error al actualizar el equipo:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'El nombre del equipo ya está en uso.',
      });
    }
    res.status(500).json({ message: 'Error al actualizar el equipo', error: error.message });
  }
};

// --- Función DELETE: Eliminar un equipo ---
exports.deleteEquipment = async (req, res) => {
  try {
    const deletedEquipment = await Equipment.findByIdAndDelete(req.params.id);
    if (!deletedEquipment) {
      return res.status(404).json({ message: 'Equipo no encontrado' });
    }
    res.status(200).json({ message: 'Equipo eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el equipo', error: error.message });
  }
};
