const mongoose = require("mongoose");

const monriTransactionSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    approvalCode: String,
    rawCallback: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "MonriTransaction",
  monriTransactionSchema
);
