const mongoose = require('mongoose');

const risInventorySchema = new mongoose.Schema(
  {
    itemName:      { type: String, required: true },
    description:   { type: String },
    unit:          { type: String, default: 'unidades' }, // ml, mg, unidades
    stockQuantity: { type: Number, default: 0 },
    costPrice:     { type: Number, default: 0 },
    sellingPrice:  { type: Number, default: 0 },
    branch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisInventory', risInventorySchema);
