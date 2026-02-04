// services/unifiedTransactionsService.js
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const unifiedRepo = require("../repositories/unifiedTransactionsRepository");
const { formatTransactionItem } = require("../repositories/../formatter/formatTransactionItems"); // adjust path

/**
 * Create a unified transaction (repository updates appropriate wallet)
 */
const createTransaction = async (data) => {
  // Validate essential fields here (defensive)
  const {
    user,
    companyOrganizer,
    organization,
    type,
    domainType,
    entityId,
    companyPoints,
    globalPoints,
    allowNegative,
    description
  } = data;
  if (!user) throw new Error("User is required");
  if (!domainType) throw new Error("domainType required");
  // if (!points || points.base === undefined || points.total === undefined) throw new Error("Invalid points payload");
  if (companyPoints === null && globalPoints === null) {
    throw new Error("At least one of companyPoints or globalPoints must be provided");
  }

  const result = await unifiedRepo.createTransaction(data);
  // return formatted transaction (or full result including walletView)
  return result;
};

/**
 * List transactions with filters and pagination
 */
const getTransactions = async ({
  page = 1,
  limit = 10,
  walletType,
  domainType,
  type,
  organization,
  companyOrganizer,
  entityId,
  startDate,
  endDate,
  keyword,
  user,
  date
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const match = {};

  if (walletType) match.walletType = walletType;
  if (domainType) match.domainType = domainType;
  if (type) match.type = type;
  if (organization) match.organization = new mongoose.Types.ObjectId(organization);
  if (companyOrganizer) match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  if (entityId) match.entityId = entityId;
  if (user) match.user = new mongoose.Types.ObjectId(user);
  if (startDate || endDate || date) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
    if (date) {
      match.createdAt.$gte = new Date(date);
      match.createdAt.$lt = new Date(new Date(date).setDate(new Date(date).getDate() + 1));
    }
    if (!Object.keys(match.createdAt).length) delete match.createdAt;
  }

  const [items, total] = await Promise.all([
    unifiedRepo.getTransactionsWithFilters({ match, keyword, skip, limit }),
    unifiedRepo.countTransactions({ match, keyword })
  ]);

  return {
    items: items.map(formatTransactionItem),
    meta: generateMeta(page, limit, total)
  };
};


const getTransactionDetails = async (id) => {
  const trx = await unifiedRepo.findTransactionById(id);
  if (!trx) return null;
  return formatTransactionItem(trx);
};

const updateTransaction = async (id, data) => {
  const trx = await unifiedRepo.findTransactionById(id);
  if (!trx) return null;

  // Allowed fields to update manually (administrative)
  const allowed = ['type', 'domainType', 'points', 'closingBalance', 'description'];
  const updateData = {};
  allowed.forEach(k => {
    if (data[k] !== undefined) updateData[k] = data[k];
  });

  if (Object.keys(updateData).length === 0) return formatTransactionItem(trx);

  await unifiedRepo.updateTransactionData(trx, updateData);
  return formatTransactionItem(trx);
};

const deleteTransaction = async (id) => {
  const updated = await unifiedRepo.findByIdAndUpdate(id, { deleted: true });
  if (!updated) return null;
  return true;
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionDetails,
  updateTransaction,
  deleteTransaction
};
