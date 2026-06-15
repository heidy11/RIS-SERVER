// logs.routes.js
const express = require('express');
const router = express.Router();
const { createLog, getLogs } = require('../controllers/logs.controller');
const { verifyToken, checkAdmin, verifyTokenToLog } = require('../middleware/auth');
// router.use(verifyToken); // Verificar token para todas las rutas de logs
// Middleware para registrar logs solo en rutas específicas
router.use('/api/', verifyTokenToLog, (req, res, next) => {
  // Definir la acción según el tipo de método
  let action;

  // Definir la acción basada en el tipo de solicitud HTTP
  if (req.method === 'POST') {
    action = 'crear';
  } else if (req.method === 'PATCH') {
    action = 'modificar';
  } else if (req.method === 'GET') {
    action = 'consultar';
  }

  // Verificar que la acción esté definida
  if (!action) {
    console.warn('Acción no definida para este método HTTP:', req.method);
  }

  // Crear log solo si la acción está definida
  if (action && !res.headersSent) {
    createLog(req, res, action);
  }

  next(); // Continuar con la solicitud
});
router.get('/api/logs', verifyToken, checkAdmin, getLogs);
module.exports = router;
