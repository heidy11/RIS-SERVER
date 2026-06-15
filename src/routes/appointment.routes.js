const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointment.controller.js');
// const { checkVista } = require('../middleware/auth.js');

router.post('/', appointmentController.createAppointment);

router.get('/', appointmentController.getAllAppointments);

router.get('/patient/:patientIdCode', appointmentController.getAppointmentsByPatientCode);

router.patch('/:id', appointmentController.updateAppointment);

router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
