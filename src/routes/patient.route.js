const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller.js');
const { checkAdmin } = require('../middleware/auth.js');

router.post('/', patientController.createPatient);

router.get('/', checkAdmin, patientController.getAllPatients);

router.get('/mongo-id/:id', patientController.getPatientById);

router.get('/code/:patientId', patientController.getPatientByCode);

router.put('/:id', checkAdmin, patientController.updatePatient);

router.patch('/:id', checkAdmin, patientController.updatePatient);

router.delete('/:id', checkAdmin, patientController.deletePatient);

module.exports = router;
