const mongoose = require("mongoose");

/**
 * One "Add card" run from Profile > Payment methods (Monri v1.4 §5.1, Save
 * from Profile). Monri runs it as scenario add_payment_method: the card is
 * authenticated with 3-D Secure and tokenized, and Monri voids the amount
 * itself, so no money is taken.
 *
 * The attempt ties the Monri order_number to the guest who started it. The
 * hosted page and its result call are reached only with the page token,
 * which is stored hashed and is single use.
 */
const cardSaveAttemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    pageTokenHash: { type: String, required: true, select: false },
    clientSecret: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["pending", "saved", "failed"],
      default: "pending",
      index: true,
    },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: "UserCard", default: null },
    error: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CardSaveAttempt", cardSaveAttemptSchema);
