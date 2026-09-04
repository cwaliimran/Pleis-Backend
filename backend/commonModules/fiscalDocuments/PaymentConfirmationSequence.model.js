const mongoose = require("mongoose");

const paymentConfirmationSequenceSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "PaymentConfirmationSequence",
  paymentConfirmationSequenceSchema,
);
