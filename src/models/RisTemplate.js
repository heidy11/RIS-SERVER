const mongoose = require('mongoose');

const risTemplateSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true },
    modality:     { type: String, required: true },
    contentHtml:  { type: String, required: true },
    radiologist:  { type: String }, // Optional: If empty, it's global. Or User ID.
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisTemplate', risTemplateSchema);
