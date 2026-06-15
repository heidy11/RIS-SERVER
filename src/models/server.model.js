const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema(
  {
    host: { type: String, required: true },
    port: { type: Number, required: true },
    calledAET: { type: String, required: true },
    callingAET: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Server', serverSchema);
