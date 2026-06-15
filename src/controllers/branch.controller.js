const Branch = require('../models/branch.model.js');
const Organization = require('../models/organization.model.js');

// --- Función CREATE: Crear una nueva sucursal ---
exports.createBranch = async (req, res) => {
  try {
    const {
      fk_organization,
      name,
      short_name,
      oid,
      country_code,
      structure_id,
      suffix,
      base64_logo,
    } = req.body;

    // 1. Validación de campos requeridos
    if (!fk_organization || !name || !short_name || !oid || !country_code || !structure_id || !suffix) {
      return res.status(400).json({ message: 'Datos inválidos: faltan campos obligatorios.' });
    }

    // 2. Verificar que la organización padre exista
    const organizationExists = await Organization.findById(fk_organization);
    if (!organizationExists) {
      return res.status(404).json({ message: 'Organización padre no encontrada.' });
    }

    // 3. Crear la nueva sucursal
    const newBranch = new Branch({
      fk_organization,
      name,
      short_name,
      oid,
      country_code,
      structure_id,
      suffix,
      base64_logo,
    });

    await newBranch.save();

    res.status(201).json({
      message: 'Sucursal creada exitosamente',
      branch: newBranch,
    });
  } catch (error) {
    console.error('Error al crear la sucursal:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: `El OID ${req.body.oid} ya está en uso por otra sucursal.`,
        error: error.message,
      });
    }

    res.status(500).json({
      message: 'Error interno al crear la sucursal',
      error: error.message,
    });
  }
};
exports.getBranchById = async (req, res) => {
  try {
    // Buscar la sucursal por su ID y poblar la información de la organización
    const branch = await Branch.findById(req.params.id)
      .populate('fk_organization', 'name short_name oid');

    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    res.status(200).json(branch);
  } catch (error) {
    // Si el ID tiene un formato inválido (Mongoose CastError)
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID de sucursal inválido' });
    }
    res.status(500).json({ message: 'Error al obtener la sucursal', error: error.message });
  }
};
// --- Función READ: Obtener todas las sucursales ---
exports.getAllBranches = async (req, res) => {
  try {
    const branches = await Branch.find()
      .populate('fk_organization', 'name short_name oid') // Obtiene info de la organización
      .sort({ name: 1 });

    res.status(200).json(branches);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las sucursales', error: error.message });
  }
};

// --- Función READ: Obtener sucursales por ID de Organización (Nuevo endpoint) ---
exports.getBranchesByOrganizationId = async (req, res) => {
  try {
    const branches = await Branch.find({ fk_organization: req.params.organizationId })
      .populate('fk_organization', 'name short_name oid')
      .sort({ name: 1 });

    if (branches.length === 0) {
      return res.status(404).json({ message: 'No se encontraron sucursales para esta organización.' });
    }

    res.status(200).json(branches);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las sucursales por organización', error: error.message });
  }
};


// --- Función UPDATE: Actualizar una sucursal (PATCH) ---
exports.updateBranch = async (req, res) => {
  try {
    const updatedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('fk_organization', 'name short_name oid');

    if (!updatedBranch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    res.status(200).json({
      message: 'Sucursal actualizada exitosamente',
      branch: updatedBranch,
    });
  } catch (error) {
    console.error('Error al actualizar la sucursal:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'El OID ya está en uso por otra sucursal.',
        error: error.message,
      });
    }
    res.status(500).json({ message: 'Error al actualizar la sucursal', error: error.message });
  }
};

// --- Función DELETE: Eliminar una sucursal ---
exports.deleteBranch = async (req, res) => {
  try {
    const deletedBranch = await Branch.findByIdAndDelete(req.params.id);
    if (!deletedBranch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }
    res.status(200).json({ message: 'Sucursal eliminada exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la sucursal', error: error.message });
  }
};
