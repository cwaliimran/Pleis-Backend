const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const referralReferenceSchema = new mongoose.Schema({
  referralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GlobalReferral",   // Reference to your existing table
    required: true
  },
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
}, { timestamps: true });


const ReferralReference = mongoose.model("ReferralReference", referralReferenceSchema);

module.exports = {
  ReferralReference,
};