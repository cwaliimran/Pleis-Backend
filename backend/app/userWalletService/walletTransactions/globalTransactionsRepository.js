// repositories/globalTransactionRepository.js
const { GlobalWalletTransactions } = require("@GlobalWalletTransactionsModel");
const { updateGlobalPoints, getUserWallet } = require("../walletManagement/userWalletRepository");

// Create a wallet transaction
const createGlobalTransaction = async (data) => {
  const session = await GlobalWalletTransactions.startSession();
  session.startTransaction();
  try {
    // Update global points in user wallet within transaction
    let { success, newBalance } = await updateGlobalPoints({
      user: data.user,
      pointsDelta: data.points.total,
      session
    });
    if (!success) {
      await session.abortTransaction();
      session.endSession();
      throw new Error("Failed to update global points for user");
    }

    // Optionally set closingBalance and statusLevelAtTime here
    // data.closingBalance = newBalance;

    const doc = new GlobalWalletTransactions(data);
    await doc.save({ session });

    await session.commitTransaction();
    session.endSession();
    return doc;
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
    .populate({ path: 'statusLevelAtTime' })
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
    .populate({ path: 'user', select: 'firstName lastName email profileIcon' })
    .populate({ path: 'statusLevelAtTime' });
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
