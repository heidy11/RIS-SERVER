const express = require('express');
const router = express.Router();
const modalityController = require('../controllers/modality.controller.js');
const { checkAdmin } = require('../middleware/auth.js'); // Middleware de seguridad

// POST /api/modalities - Crear nueva modalidad
router.post('/', modalityController.createModality);

// GET /api/modalities - Obtener todas las modalidades
router.get('/', modalityController.getAllModalities);

// GET /api/modalities/:id - Obtener modalidad por ID
router.get('/:id', modalityController.getModalityById);

// PATCH /api/modalities/:id - Actualizar modalidad
router.patch('/:id', modalityController.updateModality);

// DELETE /api/modalities/:id - Eliminar modalidad
router.delete('/:id',  modalityController.deleteModality);

module.exports = router;
