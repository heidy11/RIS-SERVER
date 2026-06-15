const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipment.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

// POST /api/equipments - Crear nuevo equipo
router.post('/', equipmentController.createEquipment);

// GET /api/equipments - Obtener todos los equipos
router.get('/', equipmentController.getAllEquipments);

// GET /api/equipments/:id - Obtener equipo por ID
router.get('/:id', equipmentController.getEquipmentById);

// PATCH /api/equipments/:id - Actualizar equipo
router.patch('/:id', equipmentController.updateEquipment);

// DELETE /api/equipments/:id - Eliminar equipo
router.delete('/:id', equipmentController.deleteEquipment);

module.exports = router;
