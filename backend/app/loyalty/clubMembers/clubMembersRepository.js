const { ClubMembers } = require("@ClubMembersModel");
const { UserCompanyLoyaltyWalletTransactions } = require("@UserCompanyLoyaltyWalletTransactionsModel");
const mongoose = require("mongoose");
const TierRepo = require("../../../admin/tiers/tiersRepository");
const Tiers = require("../../../admin/tiers/Tiers");
const { User } = require("@UserModel");

//
// Utility: Get tier key (essential, preferred, premier)
//
const getTierKeyForCompany = async (companyId) => {
  const company = await User.findById(companyId).select("companyDetails.loyaltySettings.model");
  return company?.companyDetails?.loyaltySettings?.model || "essential";
};

//
// Create or get member wallet (ClubMembers IS wallet now)
//
const ensureClubMemberWallet = async (userId, company) => {
  let member = await ClubMembers.findOne({ user: userId, companyOrganizer: company });

  const tierKey = await getTierKeyForCompany(company);


  if (!member) {
    const defaultTier = await TierRepo.getFirstTier(tierKey);
    member = await ClubMembers.create({
      user: userId,
      companyOrganizer: company,
      tierKey,
      points: 0,
      lifetimePoints: 0,
      level: defaultTier?._id || null,
      lastEvaluated: Date.now(),
    });
  }

  return member;
};

//
// Promotion logic
//
const checkPromotion = async (userId, company, tierKey) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  console.log(`[Promotion] Checking promotion for user ${userId} in company ${company} with tierKey ${tierKey}`);

  const agg = await UserCompanyLoyaltyWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        companyOrganizer: new mongoose.Types.ObjectId(company),
        type: "earn",
        createdAt: { $gte: oneYearAgo }
      }
    },
    { $group: { _id: null, total: { $sum: "$points.total" } } }
  ]);

  const earned12Months = agg.length ? agg[0].total : 0;
  console.log(`[Promotion] User ${userId} earned ${earned12Months} points in last 12 months`);

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer: company }).populate("level");
  if (!member || !member.level) {
    console.log(`[Promotion] No member or level found for user ${userId} in company ${company}`);
    return;
  }

  const currentLevel = member.level;
  const currentEntryPoints = currentLevel[tierKey]?.entryPoints || 0;
  console.log(`[Promotion] Current level entryPoints for user ${userId}: ${currentEntryPoints}`);

  const higherTiers = await Tiers.find({
    [`${tierKey}.entryPoints`]: { $gt: currentEntryPoints }
  }).sort({ [`${tierKey}.entryPoints`]: 1 });

  let selected = null;
  for (const tier of higherTiers) {
    if (earned12Months >= tier[tierKey].entryPoints) {
      selected = tier;
      console.log(`[Promotion] User ${userId} qualifies for tier ${tier.title} with entryPoints ${tier[tierKey].entryPoints}`);
    }
  }

  if (!selected) {
    console.log(`[Promotion] No promotion for user ${userId}`);
    return;
  }

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer: company },
    {
      $set: {
        level: selected._id,
        lastEvaluated: new Date(),
      }
    }
  );

  console.log(`[Promotion] User ${userId} promoted to tier ${selected.title}`);

  return { promoted: true, newLevel: selected };
};

//
// Demotion logic
//
const checkDemotion = async (userId, company, tierKey) => {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  console.log(`[Demotion] Checking demotion for user ${userId} in company ${company} with tierKey ${tierKey}`);

  const agg = await UserCompanyLoyaltyWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        companyOrganizer: new mongoose.Types.ObjectId(company),
        type: "earn",
        createdAt: { $gte: oneYearAgo }
      }
    },
    { $group: { _id: null, total: { $sum: "$points.total" } } }
  ]);

  const earned12Months = agg.length ? agg[0].total : 0;
  console.log(`[Demotion] User ${userId} earned ${earned12Months} points in last 12 months`);

  const member = await ClubMembers.findOne({ user: userId, companyOrganizer: company }).populate("level");
  if (!member || !member.level) {
    console.log(`[Demotion] No member or level found for user ${userId} in company ${company}`);
    return;
  }

  const currentLevel = member.level;
  const retainNeeded = currentLevel[tierKey]?.retainPoints || 0;
  console.log(`[Demotion] Current level retainPoints for user ${userId}: ${retainNeeded}`);

  if (earned12Months >= retainNeeded) {
    console.log(`[Demotion] User ${userId} retains current tier`);
    return;
  }

  const fallbackTier = await TierRepo.getPreviousTierByRetainPoints(tierKey, earned12Months);
  if (!fallbackTier || fallbackTier._id.toString() === currentLevel._id.toString()) {
    console.log(`[Demotion] No demotion for user ${userId}`);
    return;
  }

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer: company },
    {
      $set: {
        level: fallbackTier._id,
        lastEvaluated: Date.now(),
      }
    }
  );

  console.log(`[Demotion] User ${userId} demoted to tier ${fallbackTier.title}`);

  return { demoted: true, newLevel: fallbackTier };
};

//
// Update points (earn/spend)
//
const updatePoints = async ({
  userId,
  company,
  organization,
  pointsDelta,
  allowNegative = false,
  objectId,
  objectType,
  type = "earn",
  description = ""
}) => {
  const tierKey = await getTierKeyForCompany(company);

  let member = await ensureClubMemberWallet(userId, company);

  const newBalance = member.points + pointsDelta;
  if (!allowNegative && newBalance < 0) {
    throw new Error("Insufficient company loyalty points.");
  }

  member.points = newBalance;
  if (pointsDelta > 0) member.lifetimePoints += pointsDelta;

  await member.save();

  // Transaction
  await UserCompanyLoyaltyWalletTransactions.create({
    user: userId,
    companyOrganizer: company,
    organization,
    type, // earn, redeem, adjustment
    description,
    points: {
      base: pointsDelta,
      total: pointsDelta,
      multiplier: 1
    },
    closingBalance: newBalance,
    objectId,
    objectType,
    source: "company_loyalty"
  });

  // Promotion / Demotion
  await checkPromotion(userId, company, tierKey);
  await checkDemotion(userId, company, tierKey);

  return getWallet(userId, company);
};

//
// Get wallet (ClubMembers is wallet)
//
const getWallet = async (userId, company) => {
  const tierKey = await getTierKeyForCompany(company);

  let wallet = await ClubMembers.findOne({
    user: userId,
    companyOrganizer: company
  }).populate("level");

  if (!wallet) {
    await ensureClubMemberWallet(userId, company);
    return getWallet(userId, company);
  }

  // Attach next tier
  if (wallet.level) {
    const currentPoints = wallet.level[tierKey]?.entryPoints || 0;
    const nextTier = await TierRepo.getNextTier(tierKey, currentPoints);

    wallet = wallet.toObject();
    wallet.nextTier = nextTier || null;
  }

  return wallet;
};

//
// Join/Leave
//
const joinClub = async (userId, company) => {
  const existingMember = await ClubMembers.findOne({ user: userId, companyOrganizer: company });

  if (existingMember) {
    if (existingMember.status === "banned") {
      throw new Error("You are banned from this club.");
    }
    if (existingMember.status === "left") {
      existingMember.status = "active";
      await existingMember.save();
      await ensureClubMemberWallet(userId, company);
      return existingMember;
    }
    // Already a member (active or other status)
    return existingMember;
  }

  // const newMember = await ClubMembers.create({
  //   user: userId,
  //   companyOrganizer: company,
  // });

  let member = await ensureClubMemberWallet(userId, company);

  return member;
};

const leaveClub = async (userId, company) => {
  return ClubMembers.findOneAndUpdate(
    { user: userId, companyOrganizer: company },
    { status: "left" },
    { new: true }
  );
};

//
// Query utility
//
const isClubMember = async (userId, company) => {
  return !!(await ClubMembers.findOne({
    user: userId,
    companyOrganizer: company,
    status: "active",
  }));
};

const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};

const findClubMemberById = async (id) => {
  return ClubMembers.findById(id)
    .populate("user companyOrganizer level");
};

const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .select("companyOrganizer");
};
const getUserJoinedClubsWithPoints = async (userId) => {
  const clubs = await ClubMembers.find({ user: userId, status: { $ne: "left" } })
    .populate([
      { path: "companyOrganizer", select: "profileIcon companyDetails.loyaltySettings.title" },
      { path: "level" }
    ])
    .lean();

  return clubs
};

module.exports = {
  joinClub,
  leaveClub,
  updatePoints,
  getWallet,

  isClubMember,
  countClubMembers,
  findClubMemberById,
  getUserJoinedClubs,
  getUserJoinedClubsWithPoints
};
