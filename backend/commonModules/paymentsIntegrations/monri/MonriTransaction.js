const mongoose = require("mongoose");

const monriTransactionSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true },
    orderType: {
      type: String,
      enum: ["ticketingbookings", "userreservations", "menuorders", "tickettransfer"],
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["applePay", "card","cash"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "EUR" },

    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "cancelled",
        "invalid",
        "refunded",
      ],
      default: "pending",
    },

    approvalCode: String,

    // Monri transaction id (used for refund/void)
    monriTransactionId: { type: String, index: true },

    // Saved card token
    panToken: { type: String, index: true },

    // refund info
    refundedAmount: { type: Number, default: 0 },

    rawCallback: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "MonriTransaction",
  monriTransactionSchema
);
