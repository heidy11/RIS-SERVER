const express = require('express');
const router = express.Router();
const serverController = require('../controllers/server.controller.js');
const { checkAdmin, verifyToken } = require('../middleware/auth.js');
// Obtener servidores
router.get('/', serverController.getServers);

// Registrar nuevo servidor
router.post('/register', serverController.postServer);

// Eliminar servidor
router.delete('/deleted/:id', serverController.deleteServer);

// Actualizar servidor
router.patch('/update', serverController.patch);

// Establecer servidor por defecto
router.patch('/:id/default', serverController.setDefaultServer);

module.exports = router;
