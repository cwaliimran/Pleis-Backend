// repositories/globalTransactionRepository.js
const { GlobalWalletTransactions } = require("@GlobalWalletTransactionsModel");
const { updateGlobalPoints, getUserWallet, createUserWallet } = require("../walletManagement/userWalletRepository");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");

// Create a wallet transaction
const createGlobalTransaction = async ({
  user,
  points = {},
  allowNegative = false,
  type = "earn",       // earn | adjustment | spend
  source = "system",
  description = "",
  objectId = null,
  objectType = null
}) => {

  if (!user) throw new Error("User is required");

  const userId = typeof user === "string" ? user : (user._id || user.id);

  // 1. Fetch or create wallet
  let walletDoc = await UserGlobalWallet.findOne({ user: userId });
  if (!walletDoc) walletDoc = await createUserWallet(userId);

  const newBalance = walletDoc.global.points + points.total;

  // 2. Prevent negative balance
  if (!allowNegative && newBalance < 0) {
    throw new Error("Insufficient global points");
  }

  // 3. Update balance + lifetime for earning
  walletDoc.global.points = newBalance;
  if (points.total > 0 && type === "earn") {
    walletDoc.global.lifetimePoints += points.total;
  }

  let result = await walletDoc.save();

  // 4. Write transaction (MUST ALWAYS HAPPEN)
  const trx = await GlobalWalletTransactions.create({
    user: userId,
    type,
    source,
    points: {
      base: points.base,
      multiplier: 1,
      total: points.total
    },
    closingBalance: newBalance,
    description,
    objectId,
    objectType
  });

  await updateGlobalPoints({
    user: userId,
    pointsDelta: points.total,
    objectId,
    objectType
  })

  // 5. Return updated wallet + transaction
  const walletView = await getUserWallet(userId);

  return {
    success: true,
    points,
    newBalance,
    wallet: walletView,
    transaction: trx
  };
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
