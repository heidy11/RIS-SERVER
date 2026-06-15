const mongoose = require('mongoose');

const risCashRegisterSchema = new mongoose.Schema(
  {
    openedAt:      { type: Date, required: true },
    closedAt:      { type: Date },
    openingBalance:{ type: Number, default: 0 },
    expectedCash:  { type: Number, default: 0 }, // Based on sum of cash payments in orders
    actualCash:    { type: Number, default: 0 }, // Declared by user on closure
    status:        { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    user:          { type: String }, // Who opened/closed it
    branch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    notes:         { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisCashRegister', risCashRegisterSchema);
