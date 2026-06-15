const Organization = require('../models/organization.model.js');

// --- Función CREATE: Crear una nueva organización ---
exports.createOrganization = async (req, res) => {
  try {
    const {
      name,
      short_name,
      oid,
      country_code,
      structure_id,
      suffix,
      status,
      base64_logo,
    } = req.body;

    // Validación manual extra si se desea, aunque el modelo ya valida requeridos
    if (!name || !short_name || !oid) {
      return res.status(400).json({ message: 'Faltan campos obligatorios (nombre, nombre corto u OID).' });
    }

    const newOrganization = new Organization({
      name,
      short_name,
      oid,
      country_code,
      structure_id,
      suffix,
      status,
      base64_logo,
    });

    await newOrganization.save();

    res.status(201).json({
      message: 'Organización creada exitosamente',
      organization: newOrganization,
    });
  } catch (error) {
    console.error('Error al crear la organización:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: `El OID ${req.body.oid} ya está en uso.`,
        error: 'DuplicatedKey',
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        message: 'Error de validación',
        errors: messages,
      });
    }

    res.status(500).json({
      message: 'Error interno al crear la organización',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todas las organizaciones ---
exports.getAllOrganizations = async (req, res) => {
  try {
    // Podríamos agregar paginación aquí si la lista crece mucho
    const organizations = await Organization.find().sort({ name: 1 });
    res.status(200).json(organizations);
  } catch (error) {
    console.error('Error al obtener organizaciones:', error);
    res.status(500).json({ message: 'Error al obtener las organizaciones', error: error.message });
  }
};

// --- Función READ: Obtener una organización por ID ---
exports.getOrganizationById = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ message: 'Organización no encontrada' });
    }
    res.status(200).json(organization);
  } catch (error) {
    console.error('Error al obtener organización por ID:', error);
    res.status(500).json({ message: 'Error al obtener la organización', error: error.message });
  }
};

// --- Función UPDATE: Actualizar una organización ---
exports.updateOrganization = async (req, res) => {
  try {
    const updatedOrganization = await Organization.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedOrganization) {
      return res.status(404).json({ message: 'Organización no encontrada para actualizar' });
    }

    res.status(200).json({
      message: 'Organización actualizada exitosamente',
      organization: updatedOrganization,
    });
  } catch (error) {
    console.error('Error al actualizar la organización:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'El OID ya está en uso por otra organización.',
        error: 'DuplicatedKey',
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        message: 'Error de validación al actualizar',
        errors: messages,
      });
    }

    res.status(500).json({ message: 'Error al actualizar la organización', error: error.message });
  }
};

// --- Función DELETE: Eliminar una organización ---
exports.deleteOrganization = async (req, res) => {
  try {
    const deletedOrganization = await Organization.findByIdAndDelete(req.params.id);
    if (!deletedOrganization) {
      return res.status(404).json({ message: 'Organización no encontrada para eliminar' });
    }
    res.status(200).json({ message: 'Organización eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar organización:', error);
    res.status(500).json({ message: 'Error al eliminar la organización', error: error.message });
  }
};
