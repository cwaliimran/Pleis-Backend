const MonriTransaction = require("./MonriTransaction");

const createTransaction = async (data) => {
  return MonriTransaction.create(data);
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
