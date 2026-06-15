const Slot = require('../models/slot.model.js');
const Organization = require('../models/organization.model.js');
const Branch = require('../models/branch.model.js');
const Equipment = require('../models/equipment.model.js');
const Service = require('../models/service.model.js');

// --- Función CREATE: Crear un nuevo bloque de tiempo ---
exports.createSlot = async (req, res) => {
  try {
    const {
      organizationId, // Viene en el cuerpo, usado para construir 'domain'
      branchId,       // Viene en el cuerpo, usado para construir 'domain'
      fk_equipment,
      fk_service,
      start,
      end,
      urgency,
    } = req.body;

    // 1. Validación de campos requeridos
    if (!organizationId || !branchId || !fk_equipment || !fk_service || !start || !end) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes para el slot.' });
    }

    // 2. Verificar existencia de dependencias críticas
    const [org, branch, equip, service] = await Promise.all([
      Organization.findById(organizationId),
      Branch.findById(branchId),
      Equipment.findById(fk_equipment),
      Service.findById(fk_service),
    ]);

    if (!org) return res.status(404).json({ message: 'Organización no encontrada.' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada.' });
    if (!equip) return res.status(404).json({ message: 'Equipo no encontrado.' });
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado.' });

    // 3. Crear el nuevo Slot
    const newSlot = new Slot({
      domain: {
        organization: organizationId,
        branch: branchId,
      },
      fk_equipment,
      fk_service,
      start,
      end,
      urgency: urgency || false,
    });

    await newSlot.save();

    res.status(201).json({
      message: 'Bloque de tiempo creado exitosamente',
      slot: newSlot,
    });
  } catch (error) {
    console.error('Error al crear el slot:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'El equipo ya está programado en ese rango de tiempo (conflicto de slot).',
      });
    }

    res.status(500).json({
      message: 'Error interno al crear el bloque de tiempo',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todos los bloques de tiempo (Poblado) ---
exports.getAllSlots = async (req, res) => {
  try {
    // Poblar información para el frontend
    const slots = await Slot.find()
      .populate('domain.organization', 'name short_name')
      .populate('domain.branch', 'name short_name')
      .populate('fk_equipment', 'name model')
      .populate('fk_service', 'name fk_modality') // Podrías poblar la modalidad también
      .sort({ start: 1 });

    res.status(200).json(slots);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los slots', error: error.message });
  }
};

// --- Función READ: Obtener slots por rango de fecha, equipo o sucursal (ejemplo de filtro) ---
exports.getSlotsByFilter = async (req, res) => {
    try {
        const { startDate, endDate, branchId, equipmentId } = req.query;
        const filter = {};

        if (startDate) filter.start = { $gte: new Date(startDate) };
        if (endDate) filter.end = { $lte: new Date(endDate) };
        if (branchId) filter['domain.branch'] = branchId;
        if (equipmentId) filter.fk_equipment = equipmentId;

        // Si no hay rango de fechas, limitamos la búsqueda al futuro cercano para evitar sobrecarga
        if (!startDate && !endDate) {
             filter.end = { $gte: new Date() };
        }

        const slots = await Slot.find(filter)
            .populate('domain.organization', 'name short_name')
            .populate('domain.branch', 'name short_name')
            .populate('fk_equipment', 'name model')
            .populate('fk_service', 'name')
            .sort({ start: 1 });

        res.status(200).json(slots);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener slots filtrados', error: error.message });
    }
};


// --- Otras funciones (update/delete) ---

exports.updateSlot = async (req, res) => {
  try {
    const updatedSlot = await Slot.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedSlot) return res.status(404).json({ message: 'Slot no encontrado' });
    res.status(200).json({ message: 'Slot actualizado exitosamente', slot: updatedSlot });
  } catch (error) {
    // Si el cambio de fecha o equipo crea un conflicto de índice único, maneja el error 11000
    if (error.code === 11000) {
        return res.status(409).json({ message: 'Conflicto: El equipo ya está programado en ese nuevo rango de tiempo.' });
    }
    res.status(500).json({ message: 'Error al actualizar el slot', error: error.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    const deletedSlot = await Slot.findByIdAndDelete(req.params.id);
    if (!deletedSlot) return res.status(404).json({ message: 'Slot no encontrado' });
    res.status(200).json({ message: 'Slot eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el slot', error: error.message });
  }
};
