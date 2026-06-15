const mongoose = require('mongoose');

const RisCompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ruc: {
      type: String,
      trim: true,
      default: '',
    },
    hasInsurance: {
      type: Boolean,
      default: false,
    },
    insuranceName: {
      type: String,
      trim: true,
      default: '',
    },
    insurancePolicy: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RisCompany', RisCompanySchema);
