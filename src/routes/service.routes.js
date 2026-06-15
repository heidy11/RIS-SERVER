const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

// POST /api/services - Crear nuevo servicio
router.post('/', serviceController.createService);

// GET /api/services - Obtener todos los servicios
router.get('/', serviceController.getAllServices);

// GET /api/services/:id - Obtener servicio por ID
router.get('/:id', serviceController.getServiceById);

// PATCH /api/services/:id - Actualizar servicio
router.patch('/:id', serviceController.updateService);

// DELETE /api/services/:id - Eliminar servicio
router.delete('/:id', serviceController.deleteService);

module.exports = router;
