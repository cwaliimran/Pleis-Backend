const MonriTransaction = require("./MonriTransaction");

const createTransaction = async (data) => {
  // Use upsert to allow retry with same order number
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
