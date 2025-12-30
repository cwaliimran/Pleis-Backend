const { ClubMembers } = require("@ClubMembersModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const TierRepo = require("../../../admin/tiers/tiersRepository");
const Tiers = require("../../../admin/tiers/Tiers");
const { User } = require("@UserModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");
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


const getCompanyLoyaltyProfile = async (companyOrganizer) => {
  const [companyDoc, totalMembers] = await Promise.all([
    User.findById(companyOrganizer)
      .select(
        "companyDetails.loyaltySettings.title companyDetails.logo companyDetails.coverImage companyDetails.category companyDetails.description"
      )
      .populate({
        path: "companyDetails.category",
        select: "title image"
      })
      .lean(),
    ClubMembers.countDocuments({ companyOrganizer, status: "active" })
  ]);


  if (!companyDoc) return null;
  companyDoc.companyDetails.totalMembers = totalMembers;
  return {
    companyDetails: companyDoc.companyDetails,
  };
};


// ==========================================================
// ENSURE CLUB MEMBER WALLET EXISTS
// ==========================================================
const ensureClubMemberWallet = async (userId, companyOrganizer, session) => {
  // 1️⃣ Find member using session
  let member = await ClubMembers.findOne({
    user: userId,
    companyOrganizer
  }).session(session);

  // Fetch loyalty system info
  const { tierKey, pointValuePercentage } = await getCompanyLoyaltyInfo(companyOrganizer);

  // 2️⃣ If member does not exist → create inside session
  if (!member) {
    const defaultTier = await TierRepo.getFirstTier(tierKey);

    const [created] = await ClubMembers.create(
      [{
        user: userId,
        companyOrganizer,
        tierKey,
        pointValuePercentage,
        points: 0,
        lifetimePoints: 0,
        level: defaultTier?._id || null,
        status: "active",
        lastEvaluated: Date.now(),
      }],
      { session }
    );

    member = created;
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
  session
}) => {
  try {
    // const { tierKey } = await getCompanyLoyaltyInfo(companyOrganizer);

    let member = await ensureClubMemberWallet(userId, companyOrganizer, session);

    const delta = points.total;
    const newBalance = member.points + delta;

    if (!allowNegative && newBalance < 0) {
      return { success: false, message: "Insufficient company loyalty points." };
    }

    member.points = newBalance;
    if (delta > 0) member.lifetimePoints += delta;

    await member.save({ session });

    const wallet = await getWallet(userId, companyOrganizer, session);

    return { success: true, newBalance, wallet };
  } catch (err) {
    return { success: false, message: err.message };
  }
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

const joinClub = async (userId, companyOrganizer,referrerId) => {
  let existingMember = await ClubMembers.findOne({ user: userId, companyOrganizer });

  if (existingMember) {
    if (existingMember.status === "banned") throw new Error("You are banned from this club.");
    if (existingMember.status === "left") {
      existingMember.status = "active";
      await existingMember.save();
      return ensureClubMemberWallet(userId, companyOrganizer);
    }
    return existingMember;
  }

      //insert data in referral collection if referrerId is present
      if (referrerId) {
        await createUserReferradrecord(referrerId, userId, companyOrganizer);
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

const getUserJoinedClubsWithPoints = async ({ page = 1, limit = 10, skip, userId, keyword }) => {

  const pipeline = [
    // 1️⃣ Base match (ONLY real fields)
    {
      $match: {
        user: userId,
        status: { $ne: "left" }
      }
    },

    // 2️⃣ Populate companyOrganizer
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer",
        pipeline: [
          {
            $project: {
              "companyDetails.loyaltySettings.title": 1,
              "companyDetails.logo": 1
            }
          }
        ]
      }
    },

    // 3️⃣ Unwind organizer
    { $unwind: "$companyOrganizer" },

    // 4️⃣ Populate level
    {
      $lookup: {
        from: "tiers",
        localField: "level",
        foreignField: "_id",
        as: "level"
      }
    },
    { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } }
  ];

  // 5️⃣ Keyword filter (NOW it exists)
  if (keyword) {
    pipeline.push({
      $match: {
        "companyOrganizer.companyDetails.loyaltySettings.title": {
          $regex: keyword,
          $options: "i"
        }
      }
    });
  }

  // 6️⃣ Pagination
  pipeline.push(
    { $sort: { _id: -1 } },
    { $skip: skip ?? (page - 1) * limit },
    { $limit: limit }
  );

  return ClubMembers.aggregate(pipeline);
};


const countUserJoinedClubsWithPoints = async ({ userId, keyword }) => {

  const pipeline = [
    // 1️⃣ Base match (ONLY native fields)
    {
      $match: {
        user: userId,
        status: { $ne: "left" }
      }
    },

    // 2️⃣ Populate companyOrganizer
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },

    // 3️⃣ Unwind populated organizer
    { $unwind: "$companyOrganizer" }
  ];

  // 4️⃣ Keyword filter (NOW valid)
  if (keyword) {
    pipeline.push({
      $match: {
        "companyOrganizer.companyDetails.loyaltySettings.title": {
          $regex: keyword,
          $options: "i"
        }
      }
    });
  }

  // 5️⃣ Count
  pipeline.push({ $count: "total" });

  const result = await ClubMembers.aggregate(pipeline);
  return result.length ? result[0].total : 0;
};




const updateCompanyLoyaltySettings = async (companyOrganizer, tierKey, pointValuePercentage) => {
  await ClubMembers.updateMany(
    { companyOrganizer },
    { $set: { tierKey, pointValuePercentage } }
  );
};

// clubMembersRepository.js
const getFollowedClubIds = async (userId) => {
  return ClubMembers.distinct("companyOrganizer", {
    user: userId,
    status: "active"
  });
};










const createUserReferradrecord = async (data) => {
  try {
    const { username, userIp, userId } = data;

    // 1️⃣ Get active referral settings
    const referralSettings = await GlobalReferral.findOne({ status: "active" });
    if (!referralSettings) {
      throw new Error("Referral settings not configured.");
    }

    const { referralLimit } = referralSettings;

    // 2️⃣ Check existing referral record by IP
    const existing = await ReferredRecord.findOne({ userIp });

    // 3️⃣ Find referrer
    const referrer = await User.findOne({ username });
    if (!referrer) throw new Error("User not found.");

    // 4️⃣ Check referral limit
    if (referrer.referralsCount >= referralLimit) {
      throw new Error("Referral limit reached.");
    }

    // 5️⃣ Assign referrer if record exists but user not linked yet
    if (existing) {
      if (existing.userId) {
        throw new Error("You already have a referrer assigned.");
      }

      // Atomically increment referralsCount
      const updatedReferrer = await User.findOneAndUpdate(
        {
          _id: referrer._id,
          referralsCount: { $lt: referralLimit },
        },
        { $inc: { referralsCount: 1 } },
        { new: true }
      );

      if (!updatedReferrer) {
        throw new Error("Referral limit reached.");
      }

      existing.userId = userId;
      existing.referrerUserId = referrer._id;
      existing.referrerUserName = username;
      await existing.save();

      return {
        userId: existing.userId,
        referrerUserName: existing.referrerUserName,
      };
    }

    // 6️⃣ New referral record flow
    const updatedReferrer = await User.findOneAndUpdate(
      {
        _id: referrer._id,
        referralsCount: { $lt: referralLimit },
      },
      { $inc: { referralsCount: 1 } },
      { new: true }
    );

    if (!updatedReferrer) {
      throw new Error("Referral limit reached.");
    }

    // 7️⃣ Create referral record
    const newRecord = await ReferredRecord.create({
      referrerUserName: username,
      userIp,
      referrerUserId: referrer._id,
      userId,
    });

    return {
      userId: newRecord.userId,
      referrerUserName: newRecord.referrerUserName,
    };

  } catch (err) {
    console.error("Error saving referral data:", err);
    throw err;
  }
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
  getCompanyLoyaltyProfile,
  updateCompanyLoyaltySettings,
  getFollowedClubIds,
  countUserJoinedClubsWithPoints,
};
