const mongoose = require("mongoose");
const GlobalReward = require("@GlobalLoyaltyReward");
const { GlobalRewardsOrders } = require("@GlobalRewardsOrdersModel");
const { createTransaction } =
  require("../../userWalletService/transactions/services/unifiedTransactionsService");

/**
 * CLAIM GLOBAL REWARD
 * Creates reward order + deducts global points atomically
 */
const createGlobalRewardOrder = async ({ userId, rewardId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reward = await GlobalReward.findById(rewardId).lean();

    if (!reward) throw new Error("reward_not_found");
    if (reward.status !== "active") throw new Error("reward_not_active");
    if (reward.endDate && reward.endDate < new Date())
      throw new Error("reward_expired");

    // 1️⃣ Claim limit check
    const [limitCheck] =
      await checkClaimLimitForGlobalRewards(userId, [reward]);

    if (!limitCheck.available)
      throw new Error("reward_claim_limit_reached");

    // 2️⃣ Create reward order (status = pending by schema)
    const orderDocs = await GlobalRewardsOrders.create(
      [
        {
          user: userId,
          sourceType: "globalRewards",
          sourceId: reward._id,
          snapshot: reward,
          pointsUsed: reward.minPointsRequiredToClaim || 0,
        },
      ],
      { session }
    );

    const order = orderDocs[0];

    // 3️⃣ Deduct global wallet points
    const trx = await createTransaction(
      {
        user: userId,
        type: "redeem",
        domainType: "globalrewardsorders",
        entityId: order._id,
        globalPoints: {
          base: reward.minPointsRequiredToClaim || 0,
          total: -(reward.minPointsRequiredToClaim || 0),
        },
        allowNegative: false,
        description: `Claimed global reward ${reward.title}`,
      },
      session
    );

    if (!trx?.success) {
      throw new Error(trx?.message || "transaction_failed");
    }
    // 4️⃣ Commit
    await session.commitTransaction();
    session.endSession();
    return {
      success: true,
      order,
      transactions: trx.data,
    };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return {
      success: false,
      message: err.message,
    };
  }
};

/**
 * BATCH CLAIM LIMIT CHECK (GLOBAL)
 */
async function checkClaimLimitForGlobalRewards(userId, rewards = []) {
  if (!Array.isArray(rewards) || rewards.length === 0) return [];
  if (!userId) throw new Error("user_id_required");

  const rewardIds = rewards.map(r => r._id);

  // Aggregate claim counts
  const counts = await GlobalRewardsOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        sourceType: "globalRewards",
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

  const countMap = new Map();
  for (const c of counts) {
    countMap.set(String(c._id), c.totalClaims);
  }

  return rewards.map((reward) => {
    const rewardId = String(reward._id);
    const claimLimit = reward.claimLimit;

    // No limit → available
    if (!claimLimit || claimLimit <= 0) {
      return { rewardId, available: true };
    }

    const currentClaims = countMap.get(rewardId) || 0;
    const available = currentClaims < claimLimit;

    return { rewardId, available };
  });
}

const getUserOrders = async ({ filter, page, limit, skip }) => {
  const query = {};

  if (filter.userId) {
    query.user = new mongoose.Types.ObjectId(filter.userId);
  }

  if (filter.keyword) {
    query.$or = [
      { "snapshot.title": { $regex: filter.keyword, $options: "i" } },
      { "snapshot.description": { $regex: filter.keyword, $options: "i" } },
    ];
  }

  const total = await GlobalRewardsOrders.countDocuments(query);

  const orders = await GlobalRewardsOrders.aggregate([
    { $match: query },

    // Sort before pagination
    { $sort: { createdAt: -1 } },

    // Pagination
    { $skip: skip },
    ...(limit === 0 ? [] : [{ $limit: limit }]),

    // Convert snapshot.ticket → ObjectId safely
    {
      $addFields: {
        ticketObjectId: {
          $cond: [
            { $ifNull: ["$snapshot.ticket", false] },
            { $toObjectId: "$snapshot.ticket" },
            null
          ]
        }
      }
    },

    // Lookup ticket details
    {
      $lookup: {
        from: "ticketings",
        localField: "ticketObjectId",
        foreignField: "_id",
        as: "ticketDetails"
      }
    },

    {
      $unwind: {
        path: "$ticketDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    // Inject populated ticket into snapshot
    {
      $addFields: {
        "snapshot.reward.specialTicket.ticket": "$ticketDetails"
      }
    },

    // Cleanup temp fields
    {
      $project: {
        ticketObjectId: 0,
        ticketDetails: 0
      }
    }
  ]);

  return {
    orders,
    total,
  };
};



const getUserGlobalRewards = async (userId) => {
  return GlobalRewardsOrders.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        sourceType: "globalRewards",
      }
    },

    { $sort: { createdAt: -1 } },

    // Convert snapshot.ticket → ObjectId safely
    {
      $addFields: {
        ticketObjectId: {
          $cond: [
            { $ifNull: ["$snapshot.ticket", false] },
            { $toObjectId: "$snapshot.ticket" },
            null
          ]
        }
      }
    },

    // Lookup ticket
    {
      $lookup: {
        from: "ticketings",
        localField: "ticketObjectId",
        foreignField: "_id",
        as: "ticketDetails"
      }
    },

    {
      $unwind: {
        path: "$ticketDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    // Inject populated ticket into snapshot
    {
      $addFields: {
        "snapshot.reward.specialTicket.ticket": "$ticketDetails"
      }
    },

    // Cleanup
    {
      $project: {
        ticketObjectId: 0,
        ticketDetails: 0
      }
    }
  ]);
};


const getOrderDetails = async (orderId, userId) => {
  const match = {
    _id: new mongoose.Types.ObjectId(orderId),
  };

  if (userId) {
    match.user = new mongoose.Types.ObjectId(userId);
  }

  const result = await GlobalRewardsOrders.aggregate([
    { $match: match },

    // Convert snapshot.ticket → ObjectId safely
    {
      $addFields: {
        ticketObjectId: {
          $cond: [
            { $ifNull: ["$snapshot.ticket", false] },
            { $toObjectId: "$snapshot.ticket" },
            null
          ]
        }
      }
    },

    // Lookup ticket
    {
      $lookup: {
        from: "ticketings",
        localField: "ticketObjectId",
        foreignField: "_id",
        as: "ticketDetails"
      }
    },

    {
      $unwind: {
        path: "$ticketDetails",
        preserveNullAndEmptyArrays: true
      }
    },

    // Inject populated ticket into snapshot
    {
      $addFields: {
        "snapshot.reward.specialTicket.ticket": "$ticketDetails"
      }
    },

    // Cleanup
    {
      $project: {
        ticketObjectId: 0,
        ticketDetails: 0
      }
    }
  ]);

  return result[0] || null;
};



module.exports = {
  getUserGlobalRewards,
  getUserOrders,
  createGlobalRewardOrder,
  checkClaimLimitForGlobalRewards,
  getOrderDetails
};
