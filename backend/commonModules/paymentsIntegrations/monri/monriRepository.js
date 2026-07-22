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

module.exports = {
  createTransaction,
  findByOrderNumber,
  updateTransaction,
};
