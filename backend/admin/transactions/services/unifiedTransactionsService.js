// services/unifiedTransactionsService.js
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const unifiedRepo = require("../repositories/unifiedTransactionsRepository");
const { formatTransactionItem } = require("../repositories/../formatter/formatTransactionItems");
const { formatEnum, formatDate } = require("./formator/transactionCsvFormatter");

/**
 * List transactions with filters and pagination
 */
const getTransactionsService = async ({
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
  date, startPoints, endPoints, ballance, referral, purchaseBased, streakBased, challengeBased, promotionBased,
  sortBy, sortOrder
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const match = {};

  if (walletType) match.walletType = walletType;
  if (domainType) match.domainType = domainType;

  if (type?.trim()) {
    match.type = type.trim().toLowerCase();
  }
  if (organization && organization !== "undefined" && organization !== "null") {
    const orgIds = organization.includes("%")
      ? organization.split("%")
      : organization.split(",");

    match.organization = {
      $in: orgIds
        .filter(Boolean)
        .map(id => new mongoose.Types.ObjectId(id))
    };
  }

  if (companyOrganizer) match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  if (entityId) match.entityId = entityId;
  if (purchaseBased) {
    match.domainType = { $in: ["menuorders", "ticketingorders", "userreservations"] };
  }
  if (streakBased) {
    match.domainType = { $in: ["userstreaks"] };
  }
  if (challengeBased) {
    match.domainType = { $in: ["loyaltychallengesorders", "challenge"] };
  }
  if (promotionBased) {
    match.domainType = { $in: ["promotionorders"] };
  }
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
  if (startPoints || endPoints) {
    match["points.total"] = {};

    if (startPoints) match["points.total"].$gte = Number(startPoints);
    if (endPoints) match["points.total"].$lte = Number(endPoints);
  }

  if (ballance) {
    match.closingBalance = {};
    if (ballance) match.closingBalance.$eq = Number(ballance);
  }


  const [items, total] = await Promise.all([
    unifiedRepo.getTransactionsWithFilters({ match, keyword, skip, limit, referral, sortBy, sortOrder }),
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
const downloadTransactions = async ({

  organization,
  companyOrganizer,
  startDate,
  endDate,
}) => {

  const match = {};

  if (organization && organization !== "undefined" && organization !== "null") {
    const orgIds = organization.includes("%")
      ? organization.split("%")
      : organization.split(",");

    match.organization = {
      $in: orgIds
        .filter(Boolean)
        .map(id => new mongoose.Types.ObjectId(id))
    };
  }

  if (companyOrganizer) match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
    if (!Object.keys(match.createdAt).length) delete match.createdAt;
  }

  const [items, total] = await Promise.all([
    unifiedRepo.getTransactionsWithFilters({ match }),
    unifiedRepo.countTransactions({ match })
  ]);
  return {
    items: items.map(formatTransactionItem),
  };
};

const { Parser } = require("json2csv");

const fields = [
  "userName",
  "userEmail",
  "organizationName",
  "walletType",
  "type",
  "domainType",
  "pointsBase",
  "pointsTotal",
  "closingBalance",
  "description",
  "publicId",
  "createdAt",
];

const downloadTransactionsAsCSV = async ({
  organization,
  companyOrganizer,
  startDate,
  endDate,
}) => {
  try {
    const { items } = await downloadTransactions({
      organization,
      companyOrganizer,
      startDate,
      endDate,
    });

    if (!items || !items.length) {
      throw new Error("No transactions found");
    }

    const csvData = items.map(tx => ({
      userName: tx.user
        ? `${tx.user.firstName || ""} ${tx.user.lastName || ""}`.trim()
        : "",
      userEmail: tx.user?.email || "",
      organizationName: tx.organization?.basicInfo?.name || "",
      walletType: formatEnum(tx.walletType),
      type: formatEnum(tx.type),
      domainType: formatEnum(tx.domainType),
      pointsBase: tx.points?.base || 0,
      pointsTotal: tx.points?.total || 0,
      closingBalance: tx.closingBalance,
      description: tx.description,
      publicId: tx.publicId,
      createdAt: formatDate(tx.createdAt),
    }));

    const parser = new Parser({ fields });
    return parser.parse(csvData);
  } catch (error) {

    throw error;
  }
};
module.exports = {
  getTransactionsService,
  getTransactionDetails,
  updateTransaction,
  deleteTransaction,
  downloadTransactionsAsCSV

};
