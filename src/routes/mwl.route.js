const express = require('express');
const router = express.Router();
const mwlController = require('../controllers/mwl.controller');
const { verifyToken } = require('../middleware/auth.js');

// Estas rutas exponen datos de pacientes (nombre, fecha de nacimiento,
// procedimiento), asi que van autenticadas igual que el resto del RIS.
router.use(verifyToken);

router.get('/health', mwlController.health);
router.get('/worklist', mwlController.worklist);
router.get('/outbox', mwlController.listOutbox);
router.post('/reconcile', mwlController.reconcile);

// Verificacion de conectividad DICOM con los equipos (etapas 1B-1D)
router.post('/equipment/echo-all', mwlController.echoAll);
router.post('/equipment/:id/echo', mwlController.echoEquipment);

// Etapa 2: estado real del estudio reportado por los equipos (MPPS)
router.get('/mpps', mwlController.listMpps);
router.post('/mpps/sync', mwlController.syncMpps);

router.get('/orders/:accessionNumber/status', mwlController.orderStatus);
router.get('/preview/:accessionNumber', mwlController.preview);
router.post('/orders/:accessionNumber/retry', mwlController.retry);

module.exports = router;
