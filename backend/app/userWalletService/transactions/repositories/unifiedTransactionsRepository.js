// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updateUserCompanyPointsRepo, checkLoyaltyTierPromotion, getClosingBalance } = require("../../../loyalty/clubMembers/clubMembersRepository"); // company loyalty wallet ops
const { updateGlobalPoints, checkPromotionGlobal } = require("../../global/walletManagement/userWalletRepository");
const { nanoid } = require("nanoid");

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
    description,

  } = data;
  const userId = typeof user === "string" ? user : (user._id || user.id);

  const batchId = nanoid();
  const createdTransactions = [];

  // 1) COMPANY POINTS
  if (companyPoints && companyPoints.total !== 0) {

    const walletBalance = await getClosingBalance(userId, companyOrganizer, session);
    let closingBalance = walletBalance + companyPoints.total;

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
        closingBalance,
        description
      }],
      { session }
    );

      const walletUpdate = await updateUserCompanyPointsRepo({
        userId,
        companyOrganizer,
        points: companyPoints,
        allowNegative: false,
        session
      });
    
    //TODO demotion call via cron job in a separate function that checks for all users and organizers and sends notification if they are demoted
    // await checkDemotion(userId, companyOrganizer, session);

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

    //TODO
    //todo check global demotion via cron job in a separate function that checks for all users and sends notification if they are demoted
    // await checkDemotionGlobal(userId, session);
    createdTransactions.push(trx[0]);
  }

  return { success: true, transactions: createdTransactions };
};


const getTransactionsWithFilters = async (
  query = {},
  skip = 0,
  limit = 10
) => {

  /* ================================================
     STAGE 1 — FETCH IDS ONLY (FAST + INDEXED)
  ================================================= */

  const idPipeline = [];

  if (Object.keys(query).length) {
    idPipeline.push({ $match: query });
  }

  idPipeline.push(
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip }
  );

  if (limit > 0) {
    idPipeline.push({ $limit: limit });
  }

  idPipeline.push({ $project: { _id: 1 } });

  const ids = await UnifiedWalletTransactions.aggregate(idPipeline);

  if (!ids.length) return [];

  const txIds = ids.map(d => d._id);

  /* ================================================
     STAGE 2 — FETCH FULL DOCS + LOOKUPS
  ================================================= */

  const pipeline = [
    { $match: { _id: { $in: txIds } } },

    // preserve order
    {
      $addFields: {
        __order: { $indexOfArray: [txIds, "$_id"] }
      }
    },

    // ORGANIZATION
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] }
      }
    },

    // COMPANY ORGANIZER
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $addFields: {
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] }
      }
    },

    {
      $project: {
        batchId: 1,
        walletType: 1,
        type: 1,
        domainType: 1,
        entityId: 1,
        points: 1,
        closingBalance: 1,
        description: 1,
        publicId: 1,
        createdAt: 1,
        updatedAt: 1,
        __order: 1,

        companyOrganizer: {
          _id: "$companyOrganizer._id",
          logo: "$companyOrganizer.companyDetails.logo",
          title: "$companyOrganizer.companyDetails.loyaltySettings.title"
        },

        organization: {
          _id: "$organization._id",
          basicInfo: {
            name: "$organization.basicInfo.name",
            media: {
              logo: "$organization.basicInfo.media.logo"
            }
          }
        }
      }
    },

    { $sort: { __order: 1 } }
  ];

  return UnifiedWalletTransactions.aggregate(pipeline, {
    allowDiskUse: true
  });
};




const countTransactions = async (query = {}) => {
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
