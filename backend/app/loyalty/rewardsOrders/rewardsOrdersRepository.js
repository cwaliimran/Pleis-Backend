const mongoose = require("mongoose");
const Reward = require("@RewardModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

// Create reward order (claim)
const createRewardOrder = async ({ userId, rewardId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reward = await Reward.findById(rewardId).lean();
    if (!reward) throw new Error("reward_not_found");
    if (reward.status !== "active") throw new Error("reward_not_active");
    if (reward.endDate && reward.endDate < new Date()) {
      throw new Error("reward_expired");
    }

    // 🔒 HARD ENFORCEMENT
    if (reward.claimLimit > 0) {
      const currentClaims = await RewardsOrders.countDocuments(
        {
          user: userId,
          sourceType: "rewards",
          sourceId: reward._id,
          status: { $ne: "expired" },
        },
        { session }
      );

      if (currentClaims >= reward.claimLimit) {
        throw new Error("reward_claim_limit_reached");
      }
    }

    // Create order
    const [orderDoc] = await RewardsOrders.create(
      [
        {
          user: userId,
          sourceId: reward._id,
          sourceType: "rewards",
          snapshot: reward,
          pointsUsed: reward.minPointsRequiredToClaim || 0,
          companyOrganizer: reward.companyOrganizer,
        },
      ],
      { session }
    );

    // Deduct wallet points
    const trx = await createTransaction(
      {
        user: userId,
        companyOrganizer: reward.companyOrganizer,
        type: "redeem",
        domainType: "loyaltyrewardsorders",
        entityId: orderDoc._id,
        companyPoints: {
          base: reward.minPointsRequiredToClaim || 0,
          total: -(reward.minPointsRequiredToClaim || 0),
        },
        allowNegative: false,
        description: `Claimed reward ${reward.title}`,
      },
      session
    );

    if (!trx.success) {
      throw new Error(trx.message || "transaction_failed");
    }

    await session.commitTransaction();
    session.endSession();

    /* SEND NOTIFICATION IN BACKGROUND */
    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title: `Claimed reward ${reward.title}`,
      body: `You have successfully claimed the reward ${reward.title} using ${reward.minPointsRequiredToClaim || 0} points.`,
      data: { type: NotificationTypes.REWARD_CLAIMED, rewardId: reward._id, objectType: "loyaltyrewardsorders" },
      sender: orderDoc.companyOrganizer,
      objectId: orderDoc._id,
      image: reward.image || null,

    });

    return { success: true, order: orderDoc, transactions: trx.transactions };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return { success: false, message: err.message };
  }
};



/**
 * Batch check claim limits for multiple rewards for a specific user.
 *
 * @param {Array<{ _id: ObjectId, claimLimit: Number }>} rewards
 * @param {string|ObjectId} userId
 * @returns {Promise<Array<{ rewardId: string, available: boolean }>>}
 */
async function checkClaimLimitForLoyaltyRewards(userId, rewards = []) {
  if (!Array.isArray(rewards) || rewards.length === 0) return [];
  if (!userId) throw new Error("user_id_required");

  const rewardIds = rewards.map(r => new mongoose.Types.ObjectId(r._id));

  // 1️⃣ Aggregate user claim counts
  const counts = await RewardsOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        sourceType: "rewards",
        sourceId: { $in: rewardIds },
        status: { $ne: "expired" },
      },
    },
    {
      $group: {
        _id: "$sourceId",
        totalClaims: { $sum: 1 },
      },
    },
  ]);

  // rewardId → totalClaims
  const countMap = new Map();
  for (const c of counts) {
    countMap.set(String(c._id), c.totalClaims);
  }

  // 2️⃣ Build result per reward
  return rewards.map((reward) => {
    const rewardId = String(reward._id);
    const claimLimit = reward.claimLimit;
    const totalClaimed = countMap.get(rewardId) || 0;

    // No limit → always claimable
    if (!claimLimit || claimLimit <= 0) {
      return {
        rewardId,
        totalClaimed,
        available: true,
      };
    }

    return {
      rewardId,
      totalClaimed,
      available: totalClaimed < claimLimit,
    };
  });
}


const getRewardOrdersCounts = async (query, statusMap) => {
  return getModelCounts({ model: RewardsOrders, filterQuery: query, statusMap });
}


const getUserOrders = async (
  filter,
  page = 1,
  limit = 10,
  sort = { createdAt: -1 }
) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    { $match: filter },
    { $sort: sort },

    ...(limit !== 0 ? [{ $skip: skip }, { $limit: limit }] : []),

    // ---- Organizer populate with projection ----
    {
      $lookup: {
        from: "users",
        let: { organizerId: "$companyOrganizer" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$organizerId"] },
            },
          },
          {
            $project: {
              _id: 1,
              "companyDetails.loyaltySettings.title": 1,
              "companyDetails.logo": 1,
            },
          },
        ],
        as: "companyOrganizer",
      },
    },
    {
      $unwind: {
        path: "$companyOrganizer",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ---- Ticket extraction ----
    {
      $addFields: {
        ticketObjectId: {
          $cond: [
            { $ifNull: ["$snapshot.ticket", false] },
            { $toObjectId: "$snapshot.ticket" },
            null,
          ],
        },
      },
    },

    // ---- Ticket lookup ----
    {
      $lookup: {
        from: "ticketings",
        localField: "ticketObjectId",
        foreignField: "_id",
        as: "ticketDetails",
      },
    },
    {
      $unwind: {
        path: "$ticketDetails",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $addFields: {
        "snapshot.ticketDetails": "$ticketDetails",
      },
    },

    {
      $project: {
        ticketDetails: 0,
        ticketObjectId: 0,
      },
    },
  ];

  return RewardsOrders.aggregate(pipeline);
};


const getOrderDetails = async (orderId, userId) => {
  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(orderId),
        user: new mongoose.Types.ObjectId(userId),
      },
    },

    // ---- Organizer populate with projection ----
    {
      $lookup: {
        from: "users",
        let: { organizerId: "$companyOrganizer" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$organizerId"] },
            },
          },
          {
            $project: {
              _id: 1,
              "companyDetails.loyaltySettings.title": 1,
              "companyDetails.logo": 1,
            },
          },
        ],
        as: "companyOrganizer",
      },
    },
    {
      $unwind: {
        path: "$companyOrganizer",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ---- Ticket extraction ----
    {
      $addFields: {
        ticketObjectId: {
          $cond: [
            { $ifNull: ["$snapshot.ticket", false] },
            { $toObjectId: "$snapshot.ticket" },
            null,
          ],
        },
      },
    },

    // ---- Ticket lookup ----
    {
      $lookup: {
        from: "ticketings",
        localField: "ticketObjectId",
        foreignField: "_id",
        as: "ticketDetails",
      },
    },
    {
      $unwind: {
        path: "$ticketDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        "snapshot.ticketDetails": "$ticketDetails",
      },
    },
    {
      $project: {
        ticketDetails: 0,
        ticketObjectId: 0,
      },
    },
  ];
  let order = await RewardsOrders.aggregate(pipeline);
  return order.length ? order[0] : null;
};

module.exports = {
  createRewardOrder,
  getUserOrders,
  getRewardOrdersCounts,
  checkClaimLimitForLoyaltyRewards,
  getOrderDetails
};
