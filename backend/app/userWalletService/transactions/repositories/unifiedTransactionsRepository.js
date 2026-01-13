// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updatePoints } = require("../../../loyalty/clubMembers/clubMembersRepository"); // company loyalty wallet ops
const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const { updateGlobalPoints, createUserWallet, getUserWallet } = require("../../global/walletManagement/userWalletRepository");

const { nanoid } = require("nanoid");
const { resolveChallengeByTaskTypeService } = require("../../../loyalty/challengesOrders/challengeOrdersService");
let batchId = null;

const createTransaction = async (data, session) => {
  const {
    user,
    companyOrganizer,
    organization,
    companyPoints,
    globalPoints,
    type,
    domainType,
    entityId,
    allowNegative,
    description
  } = data;
  const userId = typeof user === "string" ? user : (user._id || user.id);

  const batchId = nanoid();
  const createdTransactions = [];

  // 1) COMPANY POINTS
  if (companyPoints && companyPoints.total !== 0) {
    const walletUpdate = await updatePoints({
      userId,
      companyOrganizer,
      points: companyPoints,
      allowNegative,
      session
    });

    if (!walletUpdate.success) return walletUpdate;

    const trx = await UnifiedWalletTransactions.create(
      [{
        user: userId,
        companyOrganizer,
        organization,
        walletType: "companyLoyalty",
        batchId,
        type,
        domainType,
        entityId,
        points: companyPoints,
        closingBalance: walletUpdate.newBalance,
        description
      }],
      { session }
    );

    createdTransactions.push(trx[0]);
  }

  // 2) GLOBAL POINTS
  if (globalPoints && globalPoints.total !== 0) {
    const walletUpdate = await updateGlobalPoints({
      user: userId,
      points: globalPoints,
      allowNegative,
      session
    });

    if (!walletUpdate.success) return walletUpdate;

    const trx = await UnifiedWalletTransactions.create(
      [{
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
      }],
      { session }
    );

    createdTransactions.push(trx[0]);
  }

  if (companyPoints && companyPoints.total !== 0) {
    resolveChallengeByTaskTypeService({
      userId,
      companyOrganizer,
      taskType: "earnPoints",
      value: companyPoints.total
    });
  }

  return { success: true, transactions: createdTransactions };
};





/**
 * Find transactions with filters + pagination
 */
const getTransactionsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return UnifiedWalletTransactions.aggregate([
    { $match: query },

    // --- ORGANIZATION LOOKUP (with projection) ---
    {
      $lookup: {
        from: "organizations",
        let: { orgId: "$organization" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media.logo": 1,
              "basicInfo.media.cover": 1
            }
          }
        ],
        as: "organization"
      }
    },
    { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },

    // --- COMPANY ORGANIZER (only when organization is null/missing) ---
    {
      $lookup: {
        from: "users",
        let: {
          organizerId: "$companyOrganizer",
          org: "$organization"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$organizerId"] },
                  { $eq: [{ $ifNull: ["$$org", null] }, null] }
                ]
              }
            }
          },
          {
            $project: {
              "companyDetails.logo": 1,
              "companyDetails.loyaltySettings.title": 1
            }
          }
        ],
        as: "companyOrganizer"
      }
    },
    { $unwind: { path: "$companyOrganizer", preserveNullAndEmptyArrays: true } },

    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit }
  ]);
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
