const Service = require('../models/service.model.js');
const Branch = require('../models/branch.model.js');
const Modality = require('../models/modality.model.js');
const Equipment = require('../models/equipment.model.js');

// --- Función CREATE: Crear un nuevo servicio ---
exports.createService = async (req, res) => {
  try {
    const {
      fk_branch,
      fk_modality,
      fk_equipments,
      name,
      status,
      calendar_settings,
    } = req.body;

    // 1. Validación de campos requeridos
    if (!fk_branch || !fk_modality || !name) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes: sucursal, modalidad y nombre.' });
    }

    // 2. Verificar existencia de dependencias (opcional, pero recomendado)
    const [branchExists, modalityExists] = await Promise.all([
      Branch.findById(fk_branch),
      Modality.findById(fk_modality),
    ]);

    if (!branchExists) return res.status(404).json({ message: 'Sucursal no encontrada.' });
    if (!modalityExists) return res.status(404).json({ message: 'Modalidad no encontrada.' });

    // Si fk_equipments está presente, podrías verificar que existan todos los IDs.

    // 3. Crear el nuevo servicio
    const newService = new Service({
      fk_branch,
      fk_modality,
      fk_equipments,
      name,
      status,
      calendar_settings,
    });

    await newService.save();

    res.status(201).json({
      message: 'Servicio creado exitosamente',
      service: newService,
    });
  } catch (error) {
    console.error('Error al crear el servicio:', error);

    if (error.code === 11000) {
        return res.status(409).json({
            message: `Ya existe un servicio llamado '${req.body.name}' para esta sucursal.`,
        });
    }

    res.status(500).json({
      message: 'Error interno al crear el servicio',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todos los servicios (Poblado) ---
exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find()
      .populate('fk_branch', 'name short_name')
      .populate('fk_modality', 'name dicom_code')
      .populate('fk_equipments', 'name model'); // Poblar información relevante

    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los servicios', error: error.message });
  }
};

// --- Función READ: Obtener un servicio por ID ---
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('fk_branch', 'name short_name')
      .populate('fk_modality', 'name dicom_code')
      .populate('fk_equipments', 'name model');

    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el servicio', error: error.message });
  }
};

// --- Función UPDATE: Actualizar un servicio (PATCH) ---
exports.updateService = async (req, res) => {
  try {
    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('fk_branch', 'name short_name')
     .populate('fk_modality', 'name dicom_code');

    if (!updatedService) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    res.status(200).json({
      message: 'Servicio actualizado exitosamente',
      service: updatedService,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el servicio', error: error.message });
  }
};

// --- Función DELETE: Eliminar un servicio ---
exports.deleteService = async (req, res) => {
  try {
    const deletedService = await Service.findByIdAndDelete(req.params.id);
    if (!deletedService) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }
    res.status(200).json({ message: 'Servicio eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el servicio', error: error.message });
  }
};
