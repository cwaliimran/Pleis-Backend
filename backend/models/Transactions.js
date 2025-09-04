const mongoose = require("mongoose");

const transactionsSchema = new mongoose.Schema(
  {
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    paymentId: {
      type: String,
      default: "",
    },
    transactionId: {
      type: String,
      default: "",
    },
    amount: {
      type: Number,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

transactionsSchema.methods.toJSON = function () {
  const transaction = this.toObject();
  const baseUrl = `${process.env.AZURE_STORAGE_BASE_URL}`;

  if (transaction.user && transaction.user.profileIcon && !transaction.user.profileIcon.startsWith("http")) {
    transaction.user.profileIcon = `${baseUrl}${transaction.user.profileIcon }`;
  }

  return transaction;
};

const Transactions = mongoose.model("Transactions", transactionsSchema);
module.exports = Transactions;
