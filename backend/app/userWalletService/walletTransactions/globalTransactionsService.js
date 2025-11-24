// services/globalTransactionService.js
const { generateMeta } = require("@utils/responseUtil");
const globalTransactionRepo = require("./globalTransactionsRepository");
const { formatTransactionItem } = require("./formatter/formatTransactionItems");
const mongoose = require("mongoose");

const createGlobalTransaction = async (data) => {
  const doc = await globalTransactionRepo.createGlobalTransaction(data);
  return formatTransactionItem(doc);
};

const getGlobalTransactions = async ({ page, limit, keyword, user, type, source, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {};
  if (user) query.user = mongoose.Types.ObjectId(user);
  if (type) query.type = type;
  if (source) query.source = source;
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  const [items, totalFiltered] = await Promise.all([
    globalTransactionRepo.getGlobalTransactionsWithFilters(query, skip, limit),
    globalTransactionRepo.countGlobalTransactions(query),
  ]);

  const formatted = items.map(doc => formatTransactionItem(doc));
  const meta = generateMeta(page, limit, totalFiltered);

  return { globalTransactions: formatted, meta };
};

const updateGlobalTransaction = async (id, data) => {
  const globalTransaction = await globalTransactionRepo.findGlobalTransactionById(id);
  if (!globalTransaction) return null;

  const allowedFields = [
    'type', 'source', 'points', 'closingBalance', 'description'
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }

  if (Object.keys(updateData).length === 0) return globalTransaction;

  Object.assign(globalTransaction, updateData);
  await globalTransaction.save();
  return formatTransactionItem(globalTransaction);
};

const deleteGlobalTransaction = async (id) => {
  const updated = await globalTransactionRepo.findByIdAndUpdate(id, { deleted: true });
  if (!updated) return null;
  return true;
};

const getGlobalTransactionDetails = async (id) => {
  const globalTransaction = await globalTransactionRepo.findGlobalTransactionById(id);
  if (!globalTransaction) return null;
  return formatTransactionItem(globalTransaction);
};

module.exports = {
  createGlobalTransaction,
  getGlobalTransactions,
  updateGlobalTransaction,
  getGlobalTransactionDetails,
  deleteGlobalTransaction,
};
