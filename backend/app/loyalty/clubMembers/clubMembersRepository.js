const { ClubMembers } = require("@ClubMembersModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");
const TierRepo = require("../../../admin/tiers/tiersRepository");
const Tiers = require("../../../admin/tiers/Tiers");
const { User } = require("@UserModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");
const LoyaltyReferralSettings = require("@LoyaltyReferralSettingsModel");
const { LoyaltyReferredRecord, LoyaltyReferredRecords } = require("@LoyaltyReferredRecordModel");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("../../../models/Notifications");
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
        "companyDetails.loyaltySettings.title companyDetails.logo companyDetails.coverImage companyDetails.category companyDetails.description accountState.status"
      )
      .populate({
        path: "companyDetails.category",
        select: "title image"
      })
      .lean(),
    ClubMembers.countDocuments({ companyOrganizer, status: "active" })
  ]);
companyDoc.companyDetails.accountState = companyDoc.accountState;

  if (!companyDoc) return null;
  companyDoc.companyDetails.totalMembers = totalMembers || 0;
  return {
    companyDetails: companyDoc.companyDetails,
  };
};


// ==========================================================
// ENSURE CLUB MEMBER WALLET EXISTS
// ==========================================================
const ensureClubMemberWallet = async (
  userId,
  companyOrganizer,
  session = null
) => {
  const { tierKey, pointValuePercentage } =
    await getCompanyLoyaltyInfo(companyOrganizer);

  const defaultTier = await TierRepo.getFirstTier(tierKey);

  const options = {
    new: true,
    upsert: true,
    ...(session ? { session } : {})
  };

  const member = await ClubMembers.findOneAndUpdate(
    { user: userId, companyOrganizer },
    {
      $setOnInsert: {
        user: userId,
        companyOrganizer,
        tierKey,
        pointValuePercentage,
        points: 0,
        lifetimePoints: 0,
        level: defaultTier?._id || null,
        status: "active",
        lastEvaluated: Date.now(),
      }
    },
    options
  );

  return member;
};




// ==========================================================
// HELPER: Calculate 12-Month Earned Points from Unified Transactions
// ==========================================================
const getEarnedPointsLast12Months = async (userId, companyOrganizer, session) => {
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
  ],
    { session }
  );

  return rows.length ? rows[0].total : 0;
};

// ==========================================================
// PROMOTION LOGIC
// ==========================================================
const checkLoyaltyTierPromotion = async (
  userId,
  companyOrganizer,
  session = null
) => {
  // 1️⃣ Earned points
  const earned12Months =
    await getEarnedPointsLast12Months(
      userId,
      companyOrganizer,
      session
    );

  // 2️⃣ Member lookup
  let memberQuery = ClubMembers.findOne({
    user: userId,
    companyOrganizer,
  });

  if (session) memberQuery = memberQuery.session(session);

  const member = await memberQuery.populate({
    path: "level",
    options: session ? { session } : {},
  });

  if (!member || !member.level) return;

  const tierKey = member.tierKey;
  const currentLevel = member.level;
  const currentEntry =
    currentLevel[tierKey]?.entryPoints || 0;

  // 3️⃣ Load higher tiers from cache
  const tiers = await TierRepo.getCachedActiveTiers(tierKey);

  const higherTiers = tiers.filter(
    t => t[tierKey]?.entryPoints > currentEntry
  );


  let promotionTarget = null;

  for (const tier of higherTiers) {
    if (
      earned12Months >=
      tier[tierKey].entryPoints
    ) {
      promotionTarget = tier;
    }
  }

  if (!promotionTarget) return;

  // 4️⃣ Update level
  const updateOptions = session ? { session } : {};

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer },
    {
      $set: {
        level: promotionTarget._id,
        lastEvaluated: new Date(),
      },
    },
    updateOptions
  );

  // 5️⃣ Fire-and-forget notification
  sendUserNotifications({
    recipientIds: [userId],
    title: `🎉 Level upgraded!`,
    body: `You have been promoted to ${promotionTarget.title}.`,
    data: {
      type: NotificationTypes.LEVEL_PROMOTED,
      levelId: promotionTarget._id,
      objectType: "tiers",
      companyOrganizer,
    },
    sender: companyOrganizer,
    objectId: promotionTarget._id,
    image: null,
  }).catch(err =>
    console.error("Promotion notification failed:", err)
  );

  return {
    promoted: true,
    newLevel: promotionTarget,
  };
};



//TODO check demotion via cron job
// ==========================================================
// DEMOTION LOGIC
// ==========================================================
const checkDemotion = async (
  userId,
  companyOrganizer,
  session = null
) => {
  // 1️⃣ Earned points
  const earned12Months =
    await getEarnedPointsLast12Months(
      userId,
      companyOrganizer,
      session
    );

  // 2️⃣ Member lookup
  let memberQuery = ClubMembers.findOne({
    user: userId,
    companyOrganizer,
  });

  if (session) memberQuery = memberQuery.session(session);

  const member = await memberQuery.populate({
    path: "level",
    options: session ? { session } : {},
  });

  if (!member || !member.level) return;

  const tierKey = member.tierKey;
  const currentLevel = member.level;
  const retainNeeded =
    currentLevel[tierKey]?.retainPoints || 0;

  if (earned12Months >= retainNeeded) return;

  // 3️⃣ Tier lookup
  const fallbackTier =
    await TierRepo.getPreviousTierByRetainPoints(
      tierKey,
      earned12Months,
      session
    );

  if (!fallbackTier) return;

  if (
    fallbackTier._id.toString() ===
    currentLevel._id.toString()
  )
    return;

  // 4️⃣ Update level
  const updateOptions = session ? { session } : {};

  await ClubMembers.updateOne(
    { user: userId, companyOrganizer },
    {
      $set: {
        level: fallbackTier._id,
        lastEvaluated: Date.now(),
      },
    },
    updateOptions
  );

  // 5️⃣ Fire-and-forget notification
  sendUserNotifications({
    recipientIds: [userId],
    title: `Level updated`,
    body: `Your membership level is now ${fallbackTier.title}.`,
    data: {
      type: NotificationTypes.LEVEL_DEMOTED,
      levelId: fallbackTier._id,
      objectType: "tiers",
      companyOrganizer,
    },
    sender: companyOrganizer,
    objectId: fallbackTier._id,
    image: null,
  }).catch(err =>
    console.error("Demotion notification failed:", err)
  );



  return {
    demoted: true,
    newLevel: fallbackTier,
  };
};



// ==========================================================
// UPDATE COMPANY LOYALTY POINTS — WALLET ONLY (NO TRANSACTIONS HERE)
// ==========================================================
const updateUserCompanyPointsRepo = async ({
  userId,
  companyOrganizer,
  points,
  allowNegative = false,
  session = null
}) => {
  try {
    const delta = points.total;

    // Ensure wallet exists (uses session if provided)
    await ensureClubMemberWallet(userId, companyOrganizer, session);

    const query = {
      user: userId,
      companyOrganizer
    };

    // Prevent negative balance atomically
    if (!allowNegative && delta < 0) {
      query.points = { $gte: Math.abs(delta) };
    }

    const update = {
      $inc: {
        points: delta,
      }
    };

    if (delta > 0) {
      update.$inc.lifetimePoints = delta;
    }

    const updated = await ClubMembers.findOneAndUpdate(
      query,
      update,
      {
        new: true,
        ...(session ? { session } : {})
      }
    );

    if (!updated) {
      return {
        success: false,
        message: "Insufficient company loyalty points."
      };
    }

    return {
      success: true,
      newBalance: updated.points
    };

  } catch (err) {
    return {
      success: false,
      message: err.message
    };
  }
};




// ==========================================================
// GET WALLET (WITH NEXT TIER INFO)
// ==========================================================
const getWallet = async (
  userId,
  companyOrganizer,
  session = null,
  { autoCreate = false } = {}
) => {
  const { tierKey } = await getCompanyLoyaltyInfo(companyOrganizer);

  let query = ClubMembers.findOne({
    user: userId,
    companyOrganizer
  }).populate("level");

  if (session) query = query.session(session);

  let wallet = await query;

  if (!wallet) {
    if (!autoCreate) return null;

    await ensureClubMemberWallet(userId, companyOrganizer, session);

    return getWallet(
      userId,
      companyOrganizer,
      session,
      { autoCreate }
    );
  }

  if (wallet.level) {
    const currentEntry =
      wallet.level[tierKey]?.entryPoints || 0;

    const nextTier =
      await TierRepo.getNextTier(tierKey, currentEntry);

    wallet = wallet.toObject();
    wallet.nextTier = nextTier || null;
  }
  return wallet;
};



const getWalletsBulk = async (
  userId,
  organizerIds
) => {
  return ClubMembers.find({
    user: userId,
    companyOrganizer: { $in: organizerIds },
  }).populate("level");
};


const joinClub = async (userId, companyOrganizer, referrerId) => {
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
  return ClubMembers.distinct("companyOrganizer", {
    user: new mongoose.Types.ObjectId(userId),
    status: "active"
  });
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
    { $sort: { points: -1 } },
    { $skip: skip ?? (page - 1) * limit },
    { $limit: limit }
  );

  return ClubMembers.aggregate(pipeline);
};


const getUserJoinedClubsWithPointsUsingFacet = async ({
  page = 1,
  limit = 10,
  userId,
  keyword,
}) => {
  const skip = (page - 1) * limit;

  const pipeline = [
    /* ===============================
       BASE MATCH (INDEXED)
    =============================== */
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: { $ne: "left" },
      },
    },

    /* ===============================
       LOOKUPS (ONLY ONCE)
    =============================== */
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
              "companyDetails.logo": 1,
            },
          },
        ],
      },
    },
    { $unwind: "$companyOrganizer" },

    {
      $lookup: {
        from: "tiers",
        localField: "level",
        foreignField: "_id",
        as: "level",
      },
    },
    { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },

    /* ===============================
       KEYWORD FILTER (POST-LOOKUP)
    =============================== */
    ...(keyword
      ? [
        {
          $match: {
            "companyOrganizer.companyDetails.loyaltySettings.title": {
              $regex: keyword,
              $options: "i",
            },
          },
        },
      ]
      : []),

    /* ===============================
       ADD TEMPORARY FIELD FOR CREATED_AT SORTING
    =============================== */
    {
      $addFields: {
        sortByCreatedAt: {
          $cond: { if: { $eq: ["$points", 0] }, then: "$createdAt", else: "$$REMOVE" },
        },
      },
    },

    /* ===============================
       SORTING, PAGINATION AND COUNT
    =============================== */
    {
      $facet: {
        data: [
          { $sort: { points: -1, sortByCreatedAt: 1 } }, // Sort by points descending, and by createdAt if points is 0
          { $skip: skip },  // Skip based on calculated page number
          { $limit: limit }, // Limit results per page
        ],
        meta: [{ $count: "total" }], // Count the total number of records
      },
    },
  ];

  const [result] = await ClubMembers.aggregate(pipeline);

  return {
    data: result.data,
    total: result.meta[0]?.total ?? 0, // Return the total count
  };
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


const createUserReferradrecord = async (referrerId, userId, companyOrganizer) => {
  try {
    // Find the loyalty referral settings for the given company
    const loyaltyReferralSettings = await LoyaltyReferralSettings.findOne({
      companyOrganizer: companyOrganizer,
      status: "active",
    });

    if (!loyaltyReferralSettings) {
      throw new Error("Loyalty referral settings not found or inactive.");
    }

    // Destructure referralLimit from the settings
    const { referralLimit } = loyaltyReferralSettings;

    // Find the referrer user
    const referrer = await User.findOne({ _id: referrerId });
    if (!referrer) {
      throw new Error("Referrer user not found.");
    }

    // Check if the referrer has reached the referral limit
    const referrerLoyaltyCount = referrer.loyaltyReferralsCount;
    if (referrerLoyaltyCount >= referralLimit) {
      throw new Error("Referral limit reached for this referrer.");
    }

    // Check if the user has already been referred
    const existingReferral = await LoyaltyReferredRecords.findOne({ user: userId });
    if (existingReferral) {
      throw new Error("User has already been referred.");
    }

    // Create a new referral record and save it with correct references
    const newReferralRecord = await LoyaltyReferredRecords.create({
      user: userId,                    // Save the user ID directly
      referrer: referrerId,             // Save the referrer ID directly
      companyOrganizer: companyOrganizer, // Save the companyOrganizer ID directly
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    // Update the referrer's loyaltyReferralsCount by incrementing it by 1
    await User.findByIdAndUpdate(referrerId, {
      $inc: { loyaltyReferralsCount: 1 }, // Increment referrer's referral count
    });

    // Return a success response with relevant data
    return {
      userId: newReferralRecord.user,    // Return the user ID from the created record
      referrerUserName: `${referrer.firstName} ${referrer.lastName}`,  // Assuming you have a first and last name on the referrer model
      message: "Referral created successfully.",
    };

  } catch (err) {

    throw err;
  }
};
const getClubMemberUserIdsByCompanyOrganizer = async (companyOrganizer) => {
  if (!companyOrganizer) return [];

  const organizerId =
    typeof companyOrganizer === "string"
      ? new mongoose.Types.ObjectId(companyOrganizer)
      : companyOrganizer;

  const members = await ClubMembers.find(
    {
      companyOrganizer: organizerId,
      status: "active",
    },
    { user: 1, _id: 0 } // ✅ only fetch user field
  )
    .lean()
    .exec();

  return members.map((m) => m.user.toString());
};

const getClubMembersForUsers = async ({ userIds, companyOrganizers }) => {
  return ClubMembers.find({
    user: { $in: userIds },
    companyOrganizer: { $in: companyOrganizers },
    status: "active"
  })
    .select("user companyOrganizer level tierKey")
    .lean();
};

//get closing balance
const getClosingBalance = async (user, companyOrganizer, session) => {
  try {
    const objectId = new mongoose.Types.ObjectId(companyOrganizer);
    const result = await ClubMembers.findOne({ companyOrganizer: objectId, user: user }).select("points").lean();
    if (result) {
      return result.points || 0;
    } else {
      //ensure wallet exists
      const member = await ensureClubMemberWallet(user, companyOrganizer, session);
      return member.points || 0;
    }
  } catch (err) {
    throw err;
  }
};


module.exports = {
  joinClub,
  leaveClub,
  updateUserCompanyPointsRepo,
  getWallet,
  getWalletsBulk,
  isClubMember,
  countClubMembers,
  findClubMemberById,
  getUserJoinedClubs,
  getUserJoinedClubsWithPoints,
  getCompanyLoyaltyInfo,
  getCompanyLoyaltyProfile,
  updateCompanyLoyaltySettings,
  getFollowedClubIds,
  getUserJoinedClubsWithPointsUsingFacet,
  getClubMemberUserIdsByCompanyOrganizer,
  getClubMembersForUsers,
  checkLoyaltyTierPromotion,
  checkDemotion,
  getClosingBalance,
};
