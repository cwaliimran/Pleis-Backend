// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updatePoints, checkPromotion, checkDemotion } = require("../../../app/loyalty/clubMembers/clubMembersRepository");
const { updateGlobalPoints, checkPromotionGlobal } = require("../../../app/userWalletService/global/walletManagement/userWalletRepository");
const { TicketingBookings } = require("@TicketingBookingsModel");

const mongoose = require("mongoose");

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
    await checkPromotion(userId, companyOrganizer, session);
    //TODO demotion call via cron job
    // await checkDemotion(userId, companyOrganizer, session);

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

    await checkPromotionGlobal(userId, session)
    //TODO call via cron job
  // checkDemotionGlobal(userId).catch(() => { });

    createdTransactions.push(trx);
  }

  return createdTransactions;
};


const buildKeywordMatch = (keyword) => {
  if (!keyword?.trim()) return null;
  const regex = new RegExp(keyword, "i");

  return {
    $or: [
      // ---- Transaction ----
      { description: regex },
      { batchId: regex },
      { publicId: regex },
      { domainType: regex },
      { walletType: regex },
      { type: regex },

      // ---- User ----
      { "user.firstName": regex },
      { "user.lastName": regex },
      { "user.email": regex },

      // ---- Organizer ----
      { "companyOrganizer.firstName": regex },
      { "companyOrganizer.lastName": regex },

      // ---- Organization ----
      { "organization.basicInfo.name": regex }
    ]
  };
};

const getTransactionsWithFilters = async ({
  match = {},
  keyword,
  skip = 0,
  limit = 10
}) => {
  const pipeline = [];

  /* ---------------- BASE MATCH ---------------- */
  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  /* ---------------- LOOKUPS ---------------- */
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    }
  );

  /* ---------------- FLATTEN ---------------- */
  pipeline.push({
    $addFields: {
      user: { $arrayElemAt: ["$user", 0] },
      companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
      organization: { $arrayElemAt: ["$organization", 0] }
    }
  });

  /* ---------------- KEYWORD SEARCH ---------------- */
  const keywordMatch = buildKeywordMatch(keyword);
  if (keywordMatch) {
    pipeline.push({ $match: keywordMatch });
  }

  /* ---------------- SORT + PAGINATION ---------------- */
  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip }
  );

  if (limit > 0) {
    pipeline.push({ $limit: limit });
  }

  /* ---------------- MINIMAL PROJECTION ---------------- */
  pipeline.push({
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

      user: {
        _id: "$user._id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        profileIcon: "$user.profileIcon"
      },

      companyOrganizer: "$companyOrganizer._id",

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
  });

  /* ---------------- RUN AGGREGATION ---------------- */
  const txList = await UnifiedWalletTransactions.aggregate(pipeline);

  if (!txList.length) return [];

  /* =====================================================
     🔥 RESTORE TICKETING BOOKINGS (LIKE OLD CODE)
     ===================================================== */

  const orderIds = txList
    .filter(t => t.domainType === "ticketingorders" && t.entityId)
    .map(t => new mongoose.Types.ObjectId(t.entityId));

  if (!orderIds.length) {
    return txList.map(tx => ({ ...tx, ticketingBookings: [] }));
  }

  const bookings = await TicketingBookings.find({
    order: { $in: orderIds }
  }).lean();

  const bookingMap = {};
  for (const bk of bookings) {
    const oid = bk.order.toString();
    if (!bookingMap[oid]) bookingMap[oid] = [];
    bookingMap[oid].push(bk);
  }

  return txList.map(tx => ({
    ...tx,
    ticketingBookings:
      tx.domainType === "ticketingorders"
        ? bookingMap[tx.entityId?.toString()] || []
        : []
  }));
};

const countTransactions = async ({ match = {}, keyword }) => {
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
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
        user: { $arrayElemAt: ["$user", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        organization: { $arrayElemAt: ["$organization", 0] }
      }
    }
  );

  const keywordMatch = buildKeywordMatch(keyword);
  if (keywordMatch) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $count: "total" });

  const res = await UnifiedWalletTransactions.aggregate(pipeline);
  return res[0]?.total || 0;
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

const getTotalClosingBalanceByOrganizationId = async (organizationId) => {
  try {
    const objectId = new mongoose.Types.ObjectId(organizationId);
    const result = await UnifiedWalletTransactions.aggregate([
      { $match: { organization: objectId } },
      { $group: { _id: null, totalClosingBalance: { $sum: "$closingBalance" } } }
    ]);
    return result.length > 0 ? result[0].totalClosingBalance : 0;
  } catch (error) {

    return 0; 
  }
};


module.exports = {
  createTransaction,
  getTransactionsWithFilters,
  countTransactions,
  findTransactionById,
  updateTransactionData,
  findByIdAndUpdate,
  deleteTransactionById,
  findTransactionsByUserId,
  getTotalClosingBalanceByOrganizationId
};
