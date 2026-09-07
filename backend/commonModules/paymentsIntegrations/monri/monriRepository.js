const MonriTransaction = require("./MonriTransaction");

const TERMINAL_STATUSES = ["paid", "refunded"];

/**
 * Create or refresh a pending Monri transaction.
 * - New orderNumber → insert
 * - Existing pending/failed/cancelled/invalid → allow retry overwrite
 * - Existing paid/refunded → reject (do not overwrite)
 */
const createTransaction = async (data) => {
  const existing = await MonriTransaction.findOne({
    orderNumber: data.orderNumber,
  }).lean();

  if (existing && TERMINAL_STATUSES.includes(existing.status)) {
    const error = new Error(
      `Order ${data.orderNumber} already ${existing.status}`
    );
    error.code = "ORDER_ALREADY_FINALIZED";
    error.statusCode = 409;
    throw error;
  }

  return MonriTransaction.findOneAndUpdate(
    { orderNumber: data.orderNumber },
    { $set: data },
    { upsert: true, new: true }
  );
};

const findByOrderNumber = async (orderNumber) => {
  return MonriTransaction.findOne({ orderNumber });
};

const updateTransaction = async (orderNumber, data) => {
  return MonriTransaction.findOneAndUpdate(
    { orderNumber },
    data,
    { new: true }
  );
};

/**
 * Card/wallet txs still pending after grace, not older than maxAge,
 * and not queried in the last grace window.
 */
const findPendingForReconcile = ({
  graceMs = 10 * 60 * 1000,
  maxAgeMs = 24 * 60 * 60 * 1000,
  limit = 8,
} = {}) => {
  const now = Date.now();
  const olderThan = new Date(now - graceMs);
  return MonriTransaction.find({
    status: "pending",
    paymentMethod: { $ne: "cash" },
    createdAt: { $gte: new Date(now - maxAgeMs), $lte: olderThan },
    $or: [
      { lastReconcileAttemptAt: { $exists: false } },
      { lastReconcileAttemptAt: null },
      { lastReconcileAttemptAt: { $lte: olderThan } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
};

// Pushes this order out of the next scan until grace elapses.
/**
 * Keep the Monri session row in sync when the order is fulfilled
 * (success URL, webhook, admin/staff mark paid). Does not create a row.
 */
const syncMonriTransactionStatus = (orderNumber, status, extra = {}) => {
  if (!orderNumber || !status) return null;
  return MonriTransaction.findOneAndUpdate(
    {
      orderNumber: String(orderNumber),
      status: { $nin: ["paid", "refunded"] },
    },
    { $set: { status, ...extra } },
    { new: true },
  );
};

const markReconcileAttempt = (orderNumber) => {
  return MonriTransaction.findOneAndUpdate(
    { orderNumber },
    { $set: { lastReconcileAttemptAt: new Date() } },
    { new: true },
  );
};

module.exports = {
  createTransaction,
  findByOrderNumber,
  updateTransaction,
  findPendingForReconcile,
  markReconcileAttempt,
  syncMonriTransactionStatus,
};
