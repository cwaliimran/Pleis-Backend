// services/unifiedTransactionsService.js
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const unifiedRepo = require("./unifiedTransactionsRepository");
const { formatTransactionItem } = require("./formatter/formatTransactionItems");

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
  endDate
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const query = {};

  if (walletType) query.walletType = walletType;
  if (domainType) query.domainType = domainType;
  if (type) query.type = type;
  if (entityId) query.entityId = entityId;

  // ✅ Organization list filter (comma or %)
  let organizationIds = [];
  if (organization) {
    organizationIds = organization
      .split(/[,%]/) // supports comma and %
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));
  }

  // ✅ If organizations provided → filter by them
  // ✅ Else → fallback to companyOrganizer
  if (organizationIds.length) {
    query.organization = { $in: organizationIds };
  } else if (companyOrganizer) {
    query.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  }

  // ✅ Date range filter
  if (startDate || endDate) {
    query.createdAt = {};

    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }

    if (Object.keys(query.createdAt).length === 0) {
      delete query.createdAt;
    }
  }

  const [items, total] = await Promise.all([
    unifiedRepo.getTransactionsWithFilters(query, skip, limit),
    unifiedRepo.countTransactions(query)
  ]);

  const formattedItems = items.map(i => formatTransactionItem(i));
  const meta = generateMeta(page, limit, total);

  return { items: formattedItems, meta };
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
