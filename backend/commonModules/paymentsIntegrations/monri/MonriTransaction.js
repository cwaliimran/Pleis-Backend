const mongoose = require("mongoose");

const monriTransactionSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "EUR" },

    status: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled", "invalid"],
      default: "pending",
    },

    approvalCode: String,

    // ✅ Saved card token from Monri (Card-on-File)
    panToken: { type: String, index: true },

    rawCallback: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "MonriTransaction",
  monriTransactionSchema
);
