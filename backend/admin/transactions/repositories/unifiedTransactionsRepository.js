// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updatePoints } = require("../../../app/loyalty/clubMembers/clubMembersRepository");
const { updateGlobalPoints } = require("../../../app/userWalletService/global/walletManagement/userWalletRepository");
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
 * Find transactions with filters + pagination + ticketingBookings (if ticketingorders)
 */
const getTransactionsWithFilters = async (query = {}, skip = 0, limit = 10) => {

    // -------------------------------------------------------------
    // 1) Fetch Unified Wallet Transactions
    // -------------------------------------------------------------
    const txList = await UnifiedWalletTransactions.find(query)
        .populate({ path: "user", select: "firstName lastName email profileIcon" })
        .populate({
            path: "organization",
            select: "basicInfo.name basicInfo.media.logo"
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); // IMPORTANT for performance + custom merging

    if (!txList.length) return [];

    // -------------------------------------------------------------
    // 2) Extract all entityIds where domainType = ticketingorders
    // -------------------------------------------------------------
    const orderIds = txList
        .filter(t => t.domainType === "ticketingorders" && t.entityId)
        .map(t => t.entityId);

    // No ticketing orders → return as is
    if (orderIds.length === 0) {
        return txList.map(tx => ({ ...tx, ticketingBookings: [] }));
    }

    // -------------------------------------------------------------
    // 3) Fetch all TicketingBookings for these orderIds
    // -------------------------------------------------------------
    const bookings = await TicketingBookings.find({
        order: { $in: orderIds }
    }).lean();

    // -------------------------------------------------------------
    // 4) Create lookup map: orderId → array of bookings
    // -------------------------------------------------------------
    const bookingMap = {};
    for (const bk of bookings) {
        const oid = bk.order.toString();
        if (!bookingMap[oid]) bookingMap[oid] = [];
        bookingMap[oid].push(bk);
    }

    // -------------------------------------------------------------
    // 5) Attach bookings to each transaction
    // -------------------------------------------------------------
    const final = txList.map(tx => {
        const oid = tx.entityId?.toString();

        return {
            ...tx,
            ticketingBookings:
                tx.domainType === "ticketingorders"
                    ? bookingMap[oid] || []
                    : []
        };
    });

    return final;
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
  findTransactionsByUserId,
};
