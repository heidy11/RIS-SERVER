const Appointment = require('../models/appoitment.model.js');
const Patient = require('../models/patient.model.js'); // Necesario para la validación

// --- Función CREATE: Agendar una nueva cita ---
exports.createAppointment = async (req, res) => {
  try {
    const { patientIdCode, date, reason, type, status, notes } = req.body;
    console.log(req.body);
    // 1. Validar campos requeridos
    if (!patientIdCode || !date || !reason || !type) {
      return res.status(400).json({ message: 'Campos obligatorios faltantes.' });
    }

    // 2. Buscar paciente por patientIdCode
    const patient = await Patient.findOne({ patientId: patientIdCode.toUpperCase() });

    if (!patient) {
      return res.status(404).json({ message: `Paciente con ID ${patientIdCode} no encontrado.` });
    }

    // 3. Crear la nueva cita
    const newAppointment = new Appointment({
      patient: patient._id, // Usamos el ID de Mongo del paciente
      patientIdCode: patientIdCode.toUpperCase(),
      date,
      reason,
      type,
      status: status || 'PENDIENTE',
      notes,
      // createdBy: req.user._id, // Asumiendo que usas un middleware de auth para obtener el usuario
    });

    // 4. Guardar cita
    await newAppointment.save();

    res.status(201).json({
      message: 'Cita agendada exitosamente',
      appointment: newAppointment,
    });
  } catch (error) {
    console.error('Error al agendar la cita:', error);

    // Manejo de error específico si la cita en ese momento ya existe (índice único)
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Ya existe una cita para este paciente a esta hora.',
        error: error.message,
      });
    }

    res.status(500).json({
      message: 'Error al crear la cita',
      error: error.message,
    });
  }
};

// --- Función READ: Obtener todas las citas (con paciente poblado) ---
exports.getAllAppointments = async (req, res) => {
  try {
    // Usamos .populate('patient') para obtener los detalles del paciente referenciado
    const appointments = await Appointment.find()
      .populate('patient', 'firstName lastName patientId dateOfBirth') // Solo trae campos relevantes del paciente
      .sort({ date: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
  }
};

// --- Función READ: Obtener citas por Patient ID (código de usuario) ---
exports.getAppointmentsByPatientCode = async (req, res) => {
  try {
    const patientIdCode = req.params.patientIdCode.toUpperCase();
    const appointments = await Appointment.find({ patientIdCode: patientIdCode })
      .populate('patient', 'firstName lastName patientId')
      .sort({ date: 1 });

    if (appointments.length === 0) {
      return res
        .status(404)
        .json({ message: `No se encontraron citas para el Patient ID: ${patientIdCode}` });
    }

    res.status(200).json(appointments);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al obtener las citas del paciente', error: error.message });
  }
};

// --- Función UPDATE: Actualizar una cita ---
exports.updateAppointment = async (req, res) => {
  try {
    const updatedAppointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedAppointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    res.status(200).json({
      message: 'Cita actualizada exitosamente',
      appointment: updatedAppointment,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar la cita', error: error.message });
  }
};

// --- Función DELETE: Eliminar una cita ---
exports.deleteAppointment = async (req, res) => {
  try {
    const deletedAppointment = await Appointment.findByIdAndDelete(req.params.id);

    if (!deletedAppointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    res.status(200).json({ message: 'Cita eliminada exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la cita', error: error.message });
  }
};
