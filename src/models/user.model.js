// server/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
  },
  correo: {
    type: String,
    required: true,
    unique: true,
  },
  contraseña: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: [
      'admin',
      'user',
      'administrativo',
      'traumatologia',
      'radiologia',
      'pediatria',
      'sala de dictados rayos x',
      'sala de dictados tomografia',
      'emergencias',
      'medico general',
      'enfermeria',
      'radiologiaTecnico',
      'radiologiaInterno',
      'medicoExterno',
    ],
    default: 'user',
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },
  vistas: {
    type: [String],
    default: ['dashboard', 'profile'],
  },
  fechaCreacion: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
