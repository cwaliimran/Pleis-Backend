// repositories/globalTransactionRepository.js
const { GlobalWalletTransactions } = require("@GlobalWalletTransactionsModel");
const { updateGlobalPoints, getUserWallet, createUserWallet } = require("../walletManagement/userWalletRepository");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");

// Create a wallet transaction
const createGlobalTransaction = async (data) => {
  const session = await GlobalWalletTransactions.startSession();
  session.startTransaction();
  try {
    const userId = data.user;
    const pointsDelta = data.points.total;

    // 1. Get wallet inside transaction
    let walletDoc = await UserGlobalWallet.findOne({ user: userId }).session(session);
    if (!walletDoc) {
      walletDoc = await createUserWallet(userId, session); // must accept session
    }

    // 2. Calculate new balance
    const newBalance = walletDoc.global.points + pointsDelta;

    if (!data.allowNegative && newBalance < 0) {
      throw new Error("Insufficient global points");
    }

    // 3. Update wallet (IN TRANSACTION)
    walletDoc.global.points = newBalance;
    if (pointsDelta > 0) walletDoc.global.lifetimePoints += pointsDelta;

    await walletDoc.save({ session });

    // 4. Write ledger transaction (IN SAME TRANSACTION)
    await GlobalWalletTransactions.create([{
      user: userId,
      type: pointsDelta >= 0 ? "earn" : "adjustment",
      source: "system",
      points: data.points,
      closingBalance: newBalance,
      objectId: data.objectId,
      objectType: data.objectType
    }], { session });

    // 5. Commit
    await session.commitTransaction();
    session.endSession();

    return { success: true, newBalance };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};


// Find with filters and pagination
const getGlobalTransactionsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalWalletTransactions.find(query)
    .populate({ path: 'user', select: 'firstName lastName email profileIcon' })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count
const countGlobalTransactions = async (query = {}) => {
  return GlobalWalletTransactions.countDocuments(query);
};

// Find by ID (with populates)
const findGlobalTransactionById = async (id) => {
  return GlobalWalletTransactions.findById(id)
    .populate({ path: 'user', select: 'firstName lastName email profileIcon' });
};

// Update + save
const updateGlobalTransactionData = async (globalTransaction, data) => {
  Object.assign(globalTransaction, data);
  return await globalTransaction.save();
};

// Soft delete by id
const findByIdAndUpdate = async (id, data) => {
  return GlobalWalletTransactions.findByIdAndUpdate(id, data, { new: true });
};

// Delete document
const deleteGlobalTransactionById = async (globalTransaction) => {
  return await globalTransaction.deleteOne();
};

// Find by user id
const findTransactionsByUserId = async (userId) => {
  return GlobalWalletTransactions.find({ user: userId }).sort({ createdAt: -1 });
};

module.exports = {
  createGlobalTransaction,
  getGlobalTransactionsWithFilters,
  countGlobalTransactions,
  findGlobalTransactionById,
  updateGlobalTransactionData,
  deleteGlobalTransactionById,
  findByIdAndUpdate,
  findTransactionsByUserId,
};
