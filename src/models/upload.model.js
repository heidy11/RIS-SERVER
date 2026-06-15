// server/models/upload.model.js
const mongoose = require('mongoose');

const filesSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
  },
  archivo: {
    type: String,
    required: true,
    unique: true,
  },
});

const Files = mongoose.model('Files', filesSchema);

module.exports = Files;
