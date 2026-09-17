const { fireAndForget } = require("../../../../helperUtils/responseUtil");
const { enqueueFiscalDocument } = require("../../../../bullmq/queues");
const { syncMonriTransactionStatus } = require("../../monri/monriRepository");
const {
  updateUserSubscriptionPaymentStatus,
} = require("../../../../organizer/subscriptions/subscriptionsService");
const { SubscriptionPaymentStatuses } = require("../../../../models/UserModel");
const {
  recordPaidCaptureLedger,
} = require("../../ledger/ledgerWriter");

const subscriptionPaymentFinalizerService = async ({ transaction, result }) => {
  if (!transaction?._id && !transaction?.orderNumber) {
    throw new Error("subscription_transaction_required");
  }
  if (result?.status !== "paid") {
    if (result?.status && transaction.orderNumber) {
      await syncMonriTransactionStatus(transaction.orderNumber, result.status, {
        ...(result.transactionId && {
          monriTransactionId: String(result.transactionId),
        }),
      }).catch((err) =>
        console.error("[monri-sync] subscription:", err.message),
      );
    }
    return { skipped: true, reason: `status_${result?.status || "unknown"}` };
  }

  if (transaction.orderNumber) {
    await syncMonriTransactionStatus(transaction.orderNumber, "paid", {
      ...(result.transactionId && {
        monriTransactionId: String(result.transactionId),
      }),
    }).catch((err) =>
      console.error("[monri-sync] subscription paid:", err.message),
    );
  }

  const types = Array.isArray(transaction.subscriptionTypes)
    ? transaction.subscriptionTypes
    : [];
  if (transaction.userId && types.length) {
    try {
      await updateUserSubscriptionPaymentStatus(transaction.userId, {
        paymentReference: transaction.orderNumber,
        providerTransactionId: result.transactionId || transaction.monriTransactionId,
        items: types.map((subscriptionType) => ({
          subscriptionType,
          status: SubscriptionPaymentStatuses.PAID,
          amount: transaction.amount,
          currency: transaction.currency || "EUR",
        })),
      });
    } catch (err) {
      console.error("[subscription-finalizer] payment status update failed:", err);
    }
  }

  fireAndForget(
    enqueueFiscalDocument({
      kind: "subscription_invoice",
      orderId: transaction.orderNumber || transaction._id,
    }),
    "FISCAL_SUBSCRIPTION_INVOICE",
  );

  // Subscription is Pleis B2B revenue — EXCLUDED from organizer payout (idempotent).
  const subOrderId = transaction.orderNumber || transaction._id;
  if (subOrderId) {
    fireAndForget(
      recordPaidCaptureLedger({
        orderId: subOrderId,
        orderType: "subscription",
        module: "SUBSCRIPTION",
        user: transaction.userId,
        amountCents:
          transaction.amountCents != null
            ? transaction.amountCents
            : Math.round(Number(transaction.amount || 0)),
        paymentStatus: "paid",
        paymentMethod: transaction.paymentMethod,
        providerTransactionId:
          result.transactionId || transaction.monriTransactionId,
      }),
      "LEDGER_SUBSCRIPTION_CAPTURE",
    );
  }

  return { handled: true };
};

module.exports = { subscriptionPaymentFinalizerService };
