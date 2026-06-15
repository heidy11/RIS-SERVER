// routes/tokenRoutes.js
const express = require('express');
const { createToken, verifyToken } = require('../controllers/token.controller');
const router = express.Router();

// Ruta para crear un token
router.post('/createToken', createToken);

// Ruta para verificar un token
router.get('/verifyToken', verifyToken);

module.exports = router;
