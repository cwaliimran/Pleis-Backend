// repositories/globalTransactionRepository.js
const { GlobalWalletTransactions } = require("@GlobalWalletTransactionsModel");
const { updateGlobalPoints, getUserWallet, createUserWallet } = require("../walletManagement/userWalletRepository");
const { UserGlobalWallet } = require("@UserGlobalWalletModel");

// Create a wallet transaction
const createGlobalTransaction = async ({
  user,
  companyOrganizer = null,
  organization = null,
  globalPoints = {},
  allowNegative = false,
  type = "earn",       // earn | adjustment | spend
  description = "",
  objectId = null,
  objectType = null
}) => {

  if (!user) throw new Error("User is required");

  const userId = typeof user === "string" ? user : (user._id || user.id);

  // 1. Fetch or create wallet
  let walletDoc = await UserGlobalWallet.findOne({ user: userId });
  if (!walletDoc) walletDoc = await createUserWallet(userId);

  const newBalance = walletDoc.global.points + globalPoints.total;

  // 2. Prevent negative balance
  if (!allowNegative && newBalance < 0) {
    throw new Error("Insufficient global points");
  }

  // 3. Update balance + lifetime for earning
  walletDoc.global.points = newBalance;
  if (globalPoints.total > 0 && type === "earn") {
    walletDoc.global.lifetimePoints += globalPoints.total;
  }

  let result = await walletDoc.save();

  // 4. Write transaction (MUST ALWAYS HAPPEN)
  const trx = await GlobalWalletTransactions.create({
    user: userId,
    companyOrganizer,
    organization,
    type,
    points: globalPoints,
    closingBalance: newBalance,
    description,
    objectId,
    objectType
  });

  const { walletView } = await updateGlobalPoints({
    user: userId,
    pointsDelta: globalPoints.total,
    objectId,
    objectType
  })

  return {
    success: true,
    points: globalPoints,
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
