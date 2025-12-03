const mongoose = require('mongoose');

const referralRecordSchema = new mongoose.Schema({
  userIp: {
    type: String,
    required: true,
    unique: true,
  },
  referralId: {
    type: String,
    required: true,
    ref: 'ReferralReference',
  },
  status: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

referralRecordSchema.index({ userIp: 1 }, { unique: true });

const ReferralRecord = mongoose.model('ReferralRecord', referralRecordSchema);

module.exports = {
  ReferralRecord,
};
