const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller.js');
const { checkAdmin, verifyToken } = require('../middleware/auth.js');

// Ruta para registro
router.post('/register', verifyToken, checkAdmin, authController.register);

// Ruta para login
router.post('/login', authController.login);

module.exports = router;
