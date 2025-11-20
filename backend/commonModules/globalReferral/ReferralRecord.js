const mongoose = require('mongoose');

// Define the ReferralRecord Schema
const referralRecordSchema = new mongoose.Schema({
  userIp: {
    type: String,
    required: true,  // IP address is required
  },
  referralId: {
    type: String,
    required: true,  // publicId is required
    ref: 'ReferralReference',  // Reference to the ReferralReference schema (publicId field)
  },
  
  status: {
    type: Boolean,
    required: true,  // Status is required (true/false)
    default: true,   // Default value is true
  },
}, { timestamps: true });  // Automatically adds createdAt and updatedAt

const ReferralRecord = mongoose.model('ReferralRecord', referralRecordSchema);

module.exports = {
  ReferralRecord,
};
