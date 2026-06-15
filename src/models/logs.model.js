// logs.model.js
const mongoose = require('mongoose');

// Definir el esquema del log
const logSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true, // Campo obligatorio
  },
  route: {
    type: String,
    required: true, // Campo obligatorio
  },
  action: {
    type: String,
    required: true, // Acción (crear, modificar, consultar)
  },
  method: {
    type: String,
    required: true, // Método HTTP
  },
  timestamp: {
    type: Date,
    default: Date.now, // Marca de tiempo de la solicitud
  },
  userAgent: {
    type: String, // Agente de usuario (navegador)
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId, // ID del usuario autenticado
    ref: 'User', // Referencia al modelo 'User' para una relación (opcional)
    required: false, // No obligatorio, ya que algunos logs pueden no tener usuario autenticado
  },
  userName: {
    type: String, // Rol del usuario (admin, user, etc.)
    required: false, // No obligatorio, ya que no siempre estará presente
  },
  userRole: {
    type: String, // Rol del usuario (admin, user, etc.)
    required: false, // No obligatorio, ya que no siempre estará presente
  },
});

// Crear el modelo de log
const Log = mongoose.model('Log', logSchema);

module.exports = Log;
