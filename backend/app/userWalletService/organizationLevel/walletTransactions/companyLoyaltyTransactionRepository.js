const { UserCompanyLoyaltyWalletTransactions } = require("@UserCompanyLoyaltyWalletTransactionsModel");
const { updatePoints } = require("../../../loyalty/clubMembers/clubMembersRepository");
/**
 * CREATE TRANSACTION (uses ClubMembers as wallet)
 */
const createCompanyTransaction = async ({
  user,
  companyOrganizer,
  organization,
  points = {},
  allowNegative = false,
  type = "earn",
  description = "",
  objectId = null,
  objectType = null
}) => {

  if (!user) throw new Error("User is required");

  const userId = typeof user === "string" ? user : (user._id || user.id);

  const pointsDelta = points.total;

  // Update main wallet (ClubMembers model)
  const wallet = await updatePoints({
    userId,
    company: companyOrganizer,
    organization,
    type,
    description,
    pointsDelta,
    allowNegative,
    objectId,
    objectType
  });


  return wallet;
};


/**
 * LIST with filters + pagination
 */
const getCompanyTransactionsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return UserCompanyLoyaltyWalletTransactions.find(query)
    .populate({ path: "user", select: "firstName lastName email profileIcon" })
    .populate({ path: "companyOrganizer", select: "firstName lastName profileIcon companyDetails.loyaltySettings.title" })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

/**
 * COUNT
 */
const countCompanyTransactions = (query = {}) => {
  return UserCompanyLoyaltyWalletTransactions.countDocuments(query);
};


/**
 * FIND BY ID
 */
const findCompanyTransactionById = (id) => {
  return UserCompanyLoyaltyWalletTransactions.findById(id)
    .populate({ path: "user", select: "firstName lastName email profileIcon" })
    .populate({ path: "companyOrganizer", select: "firstName lastName profileIcon" });
};


module.exports = {
  createCompanyTransaction,
  getCompanyTransactionsWithFilters,
  countCompanyTransactions,
  findCompanyTransactionById
};
