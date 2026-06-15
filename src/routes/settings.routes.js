const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

// GET /api/settings - Obtener la configuración (accesible para cualquier usuario logeado)
router.get('/', settingsController.getSettings);

// PATCH /api/settings - Actualizar la configuración
// Protegida: Solo Admin
router.patch('/', settingsController.updateSettings);

module.exports = router;
