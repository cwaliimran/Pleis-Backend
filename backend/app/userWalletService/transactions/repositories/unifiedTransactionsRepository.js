// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updatePoints } = require("../../../loyalty/clubMembers/clubMembersRepository"); // company loyalty wallet ops
const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const { updateGlobalPoints, createUserWallet, getUserWallet } = require("../../global/walletManagement/userWalletRepository");

const { nanoid } = require("nanoid");
let batchId = null;

const createTransaction = async ({
  user,
  companyOrganizer = null,
  organization = null,

  // unified inputs
  companyPoints = null,
  globalPoints = null,

  type = "earn",
  domainType,
  entityId = null,

  allowNegative = false,
  description = ""
}) => {
  const batchId = nanoid();
  if (!user) throw new Error("User is required");

  const userId = typeof user === "string" ? user : (user._id || user.id);
  const createdTransactions = [];

  /* =====================================================
     1) COMPANY LOYALTY TRANSACTION
     ===================================================== */
  if (companyPoints && companyPoints.total !== 0) {

    const wallet = await updatePoints({
      userId,
      companyOrganizer,
      points: companyPoints,       // CONSISTENT NOW
      allowNegative
    });

    const closingBalance =
      wallet?.company?.points ??
      wallet?.closingBalance ??
      wallet?.points ??
      0;

    const trx = await UnifiedWalletTransactions.create({
      user: userId,
      companyOrganizer,
      organization,
      walletType: "companyLoyalty",
      batchId,
      type,
      domainType,
      entityId,
      points: companyPoints,
      closingBalance,
      description
    });

    createdTransactions.push(trx);
  }

  /* =====================================================
     2) GLOBAL WALLET TRANSACTION
     ===================================================== */
  if (globalPoints && globalPoints.total !== 0) {

    // update wallet first
    const walletUpdate = await updateGlobalPoints({
      user: userId,
      points: globalPoints,
      allowNegative
    });

    const trx = await UnifiedWalletTransactions.create({
      user: userId,
      companyOrganizer,
      organization,
      walletType: "globalWallet",
      batchId,
      type,
      domainType,
      entityId,
      points: globalPoints,
      closingBalance: walletUpdate.newBalance,
      description
    });

    createdTransactions.push(trx);
  }

  return createdTransactions;
};



/**
 * Find transactions with filters + pagination
 */
const getTransactionsWithFilters = async (query = {}, skip = 0, limit = 10) => {
    return UnifiedWalletTransactions.find(query)
        .populate({
            path: "organization",
            select: "basicInfo.name basicInfo.media.logo"
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit).lean();
};


const countTransactions = (query = {}) => {
  return UnifiedWalletTransactions.countDocuments(query);
};

const findTransactionById = (id) => {
  return UnifiedWalletTransactions.findById(id)
    .populate({ path: "user", select: "firstName lastName email profileIcon" })
    .populate({ path: "companyOrganizer", select: "firstName lastName profileIcon" })
    .populate({ path: "organization", select: "basicInfo.name" });
};

const updateTransactionData = async (transactionDoc, data) => {
  Object.assign(transactionDoc, data);
  return await transactionDoc.save();
};

const findByIdAndUpdate = async (id, data) => {
  return UnifiedWalletTransactions.findByIdAndUpdate(id, data, { new: true });
};

const deleteTransactionById = async (transactionDoc) => {
  return await transactionDoc.deleteOne();
};

const findTransactionsByUserId = async (userId) => {
  return UnifiedWalletTransactions.find({ user: userId }).sort({ createdAt: -1 });
};

module.exports = {
  createTransaction,
  getTransactionsWithFilters,
  countTransactions,
  findTransactionById,
  updateTransactionData,
  findByIdAndUpdate,
  deleteTransactionById,
  findTransactionsByUserId
};
