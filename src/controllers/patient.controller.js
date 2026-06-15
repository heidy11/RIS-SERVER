const PatientService = require('../services/patient.service.js');
const responseHandler = require('../utils/responseHandler.js');

exports.createPatient = async (req, res) => {
  try {
    const newPatient = await PatientService.createPatient(req.body);

    responseHandler.success(res, 201, { patient: newPatient }, 'Paciente creado exitosamente');
  } catch (error) {
    console.error('Error al guardar el paciente:', error);

    if (error.message.startsWith('Datos inválidos')) {
        return responseHandler.error(res, 400, error.message);
    }

    if (error.code === 11000) {
      return responseHandler.error(res, 409, `El código de paciente (Patient ID: ${req.body.patientId}) ya existe.`, error.message);
    }

    responseHandler.error(res, 500, 'Error interno al crear el paciente', error);
  }
};

exports.getAllPatients = async (req, res) => {
  try {
    const patients = await PatientService.getAllPatients();
    res.status(200).json(patients);
  } catch (error) {
    responseHandler.error(res, 500, 'Error al obtener los pacientes', error);
  }
};

exports.getPatientById = async (req, res) => {
  try {
    const patient = await PatientService.getPatientById(req.params.id);
    if (!patient) {
      return responseHandler.error(res, 404, 'Paciente no encontrado');
    }
    res.status(200).json(patient);
  } catch (error) {
    responseHandler.error(res, 500, 'Error al obtener el paciente', error);
  }
};

exports.getPatientByCode = async (req, res) => {
  try {
    const patient = await PatientService.getPatientByCode(req.params.patientId);
    if (!patient) {
      return responseHandler.error(res, 404, 'Paciente no encontrado por Patient ID');
    }
    res.status(200).json(patient);
  } catch (error) {
    responseHandler.error(res, 500, 'Error al obtener el paciente por Patient ID', error);
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const updatedPatient = await PatientService.updatePatient(req.params.id, req.body);

    if (!updatedPatient) {
      return responseHandler.error(res, 404, 'Paciente no encontrado');
    }
    responseHandler.success(res, 200, { patient: updatedPatient }, 'Paciente actualizado exitosamente');
  } catch (error) {
    if (error.name === 'ValidationError') {
      return responseHandler.error(res, 400, 'Error de validación al actualizar', error.message);
    }
    if (error.code === 11000) {
      return responseHandler.error(res, 409, 'El código de paciente (Patient ID) ya está en uso.', error.message);
    }

    responseHandler.error(res, 500, 'Error al actualizar el paciente', error);
  }
};

exports.deletePatient = async (req, res) => {
  try {
    const deletedPatient = await PatientService.deletePatient(req.params.id);
    if (!deletedPatient) {
      return responseHandler.error(res, 404, 'Paciente no encontrado');
    }
    responseHandler.success(res, 200, { patient: deletedPatient }, 'Paciente eliminado exitosamente');
  } catch (error) {
    responseHandler.error(res, 500, 'Error al eliminar el paciente', error);
  }
};
