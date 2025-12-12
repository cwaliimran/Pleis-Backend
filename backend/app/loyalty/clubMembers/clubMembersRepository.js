const { ClubMembers } = require("@ClubMembersModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const TierRepo = require("../../../admin/tiers/tiersRepository");
const Tiers = require("../../../admin/tiers/Tiers");
const { User } = require("@UserModel");

// ==========================================================
// GET COMPANY LOYALTY SETTINGS (tier model + pointValuePercentage)
// ==========================================================
const getCompanyLoyaltyInfo = async (companyId) => {
  const company = await User.findById(companyId)
    .select("companyDetails.loyaltySettings.model companyDetails.loyaltySettings.pointValuePercentage");

  return {
    tierKey: company?.companyDetails?.loyaltySettings?.model || "essential",
    pointValuePercentage: company?.companyDetails?.loyaltySettings?.pointValuePercentage || 0
  };
};

// ==========================================================
// ENSURE CLUB MEMBER WALLET EXISTS
// ==========================================================
const ensureClubMemberWallet = async (userId, companyOrganizer) => {
  let member = await ClubMembers.findOne({ user: userId, companyOrganizer });

  const { tierKey, pointValuePercentage } = await getCompanyLoyaltyInfo(companyOrganizer);

  if (!member) {
    const defaultTier = await TierRepo.getFirstTier(tierKey);
    member = await ClubMembers.create({
      user: userId,
      companyOrganizer,
      tierKey,
      pointValuePercentage,
      points: 0,
      lifetimePoints: 0,
      level: defaultTier?._id || null,
      status: "active",
      lastEvaluated: Date.now(),
    });
  }

  return member;
};

// ==========================================================
// HELPER: Calculate 12-Month Earned Points from Unified Transactions
// ==========================================================
const getEarnedPointsLast12Months = async (userId, companyOrganizer) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const rows = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        walletType: "companyLoyalty",
        type: "earn",
        createdAt: { $gte: oneYearAgo }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$points.total" }
      }
    }
  ]);

  return rows.length ? rows[0].total : 0;
};

// ==========================================================
// PROMOTION LOGIC
// ==========================================================
const checkPromotion = async (userId, companyOrganizer, tierKey) => {
  const earned12Months = await getEarnedPointsLast12Months(userId, companyOrganizer);

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer }).populate("level");
  if (!member || !member.level) return;

  const currentLevel = member.level;
  const currentEntry = currentLevel[tierKey]?.entryPoints || 0;

  const higherTiers = await Tiers.find({
    [`${tierKey}.entryPoints`]: { $gt: currentEntry }
  }).sort({ [`${tierKey}.entryPoints`]: 1 });

  let promotionTarget = null;

  for (const tier of higherTiers) {
    if (earned12Months >= tier[tierKey].entryPoints) {
      promotionTarget = tier;
    }
  }

  if (!promotionTarget) return;

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer },
    {
      $set: {
        level: promotionTarget._id,
        lastEvaluated: new Date()
      }
    }
  );

  return { promoted: true, newLevel: promotionTarget };
};

// ==========================================================
// DEMOTION LOGIC
// ==========================================================
const checkDemotion = async (userId, companyOrganizer, tierKey) => {
  const earned12Months = await getEarnedPointsLast12Months(userId, companyOrganizer);

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer }).populate("level");
  if (!member || !member.level) return;

  const currentLevel = member.level;
  const retainNeeded = currentLevel[tierKey]?.retainPoints || 0;

  if (earned12Months >= retainNeeded) return;

  const fallbackTier = await TierRepo.getPreviousTierByRetainPoints(tierKey, earned12Months);

  if (!fallbackTier || fallbackTier._id.toString() === currentLevel._id.toString()) return;

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer },
    {
      $set: {
        level: fallbackTier._id,
        lastEvaluated: Date.now()
      }
    }
  );

  return { demoted: true, newLevel: fallbackTier };
};

// ==========================================================
// UPDATE COMPANY LOYALTY POINTS — WALLET ONLY (NO TRANSACTIONS HERE)
// ==========================================================
const updatePoints = async ({
  userId,
  companyOrganizer,
  points,
  allowNegative = false,
}) => {
  const { tierKey } = await getCompanyLoyaltyInfo(companyOrganizer);

  let member = await ensureClubMemberWallet(userId, companyOrganizer);

  const delta = points.total;
  const newBalance = member.points + delta;

  if (!allowNegative && newBalance < 0) {
    throw new Error("Insufficient company loyalty points.");
  }

  member.points = newBalance;
  if (delta > 0) member.lifetimePoints += delta;

  await member.save();

  await checkPromotion(userId, companyOrganizer, tierKey);
  await checkDemotion(userId, companyOrganizer, tierKey);

  return getWallet(userId, companyOrganizer);
};


// ==========================================================
// GET WALLET (WITH NEXT TIER INFO)
// ==========================================================
const getWallet = async (userId, companyOrganizer) => {
  const { tierKey } = await getCompanyLoyaltyInfo(companyOrganizer);

  let wallet = await ClubMembers.findOne({
    user: userId,
    companyOrganizer
  }).populate("level");

  if (!wallet) {
    await ensureClubMemberWallet(userId, companyOrganizer);
    return getWallet(userId, companyOrganizer);
  }

  if (wallet.level) {
    const currentEntry = wallet.level[tierKey]?.entryPoints || 0;
    const nextTier = await TierRepo.getNextTier(tierKey, currentEntry);

    wallet = wallet.toObject();
    wallet.nextTier = nextTier || null;
  }

  return wallet;
};

// ==========================================================
// OTHER CLUB MEMBER OPERATIONS (unchanged)
// ==========================================================
const isClubMemberWithWallet = async (userId, companyOrganizer) => {
  const member = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "active"
  });
  if (!member) return null;
  return getWallet(userId, companyOrganizer);
};

const joinClub = async (userId, companyOrganizer) => {
  const existingMember = await ClubMembers.findOne({ user: userId, companyOrganizer });

  if (existingMember) {
    if (existingMember.status === "banned") throw new Error("You are banned from this club.");
    if (existingMember.status === "left") {
      existingMember.status = "active";
      await existingMember.save();
      return ensureClubMemberWallet(userId, companyOrganizer);
    }
    return existingMember;
  }

  return ensureClubMemberWallet(userId, companyOrganizer);
};

const leaveClub = async (userId, companyOrganizer) => {
  return ClubMembers.findOneAndUpdate(
    { user: userId, companyOrganizer },
    { status: "left" },
    { new: true }
  );
};

const isClubMember = async (userId, companyOrganizer) => {
  return !!(await ClubMembers.findOne({ user: userId, companyOrganizer, status: "active" }));
};

const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};

const findClubMemberById = async (id) => {
  return ClubMembers.findById(id).populate("user companyOrganizer level");
};

const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .select("companyOrganizer");
};

const getUserJoinedClubsWithPoints = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .populate([
      { path: "companyOrganizer", select: "profileIcon companyDetails.loyaltySettings.title" },
      { path: "level" }
    ])
    .lean();
};

const updateCompanyLoyaltySettings = async (companyOrganizer, tierKey, pointValuePercentage) => {
  await ClubMembers.updateMany(
    { companyOrganizer },
    { $set: { tierKey, pointValuePercentage } }
  );
};

module.exports = {
  joinClub,
  leaveClub,
  updatePoints,
  getWallet,
  isClubMember,
  isClubMemberWithWallet,
  countClubMembers,
  findClubMemberById,
  getUserJoinedClubs,
  getUserJoinedClubsWithPoints,
  getCompanyLoyaltyInfo,
  updateCompanyLoyaltySettings
};
