const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slot.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

// POST /api/slots - Crear un nuevo bloque de tiempo
router.post('/', slotController.createSlot);

// GET /api/slots - Obtener todos los slots (o filtrar por query params)
// Usamos el mismo endpoint para obtener todos y para filtrar por query (ej: ?branchId=xxx&startDate=yyy)
router.get('/', slotController.getSlotsByFilter);

// GET /api/slots/all - Obtener todos los slots sin filtro de fecha (opcional)
router.get('/all', slotController.getAllSlots);

// PATCH /api/slots/:id - Actualizar slot
router.patch('/:id', slotController.updateSlot);

// DELETE /api/slots/:id - Eliminar slot
router.delete('/:id', slotController.deleteSlot);

module.exports = router;
