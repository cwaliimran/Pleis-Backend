/**
 * A guest checkout through Pleis started minutes ago must not change under
 * them: no edit and no payment method change while a Monri payment for the
 * order is still pending (#129, #130).
 */
const mongoose = require("mongoose");
const { isPleisMethod } = require("./paymentMethods");

const PAYMENT_IN_PROGRESS_MS = 15 * 60 * 1000;

async function assertNoPaymentInProgress(order) {
  if (!isPleisMethod(order.paymentMethod)) return;
  const recent = await mongoose.connection.db.collection("monritransactions").findOne({
    orderNumber: String(order._id),
    status: "pending",
    createdAt: { $gte: new Date(Date.now() - PAYMENT_IN_PROGRESS_MS) },
  });
  if (recent) {
    const err = new Error("payment_in_progress");
    err.statusCode = 409;
    throw err;
  }
}

module.exports = { assertNoPaymentInProgress, PAYMENT_IN_PROGRESS_MS };
