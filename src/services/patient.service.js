const Patient = require('../models/patient.model.js');

class PatientService {
  async createPatient(data) {
    const {
      patientId,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      phoneNumber,
      address,
      emergencyContact,
      notes,
    } = data;

    if (!patientId || !firstName || !lastName || !gender || !dateOfBirth) {
      throw new Error('Datos inválidos. Campos obligatorios faltantes: patientId, firstName, lastName, gender, dateOfBirth.');
    }

    const newPatient = new Patient({
      patientId,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      phoneNumber,
      address,
      emergencyContact,
      notes,
    });

    return await newPatient.save();
  }

  async getAllPatients() {
    return await Patient.find().sort({ lastName: 1, firstName: 1 });
  }

  async getPatientById(id) {
    return await Patient.findById(id);
  }

  async getPatientByCode(patientId) {
    return await Patient.findOne({ patientId: patientId.toUpperCase() });
  }

  async updatePatient(id, data) {
    return await Patient.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }

  async deletePatient(id) {
    return await Patient.findByIdAndDelete(id);
  }
}

module.exports = new PatientService();
