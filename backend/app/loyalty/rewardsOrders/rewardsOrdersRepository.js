const mongoose = require("mongoose");
const Reward = require("@RewardModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { createTransactionService } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { createTicketingBookingService } = require("../../bookings/ticketings/ticketingBookingService");

// Create reward order (claim)
const createRewardOrder = async ({ userId, rewardId, protectionUserDetails, timezone }) => {
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
    let orderDoc = null;
    let trx = null;

    //if reward type is ticket then create a ticket otherwise create a normal reward order
    if (reward.rewardType === "ticketReward") {
      //create a ticket
      let ticketData = {
        ticketId: reward.ticket,
        timeSlot: reward.timeslot || null,
        isFastTrack: reward.isFastTrack || false,
        protectionUserDetails: {
          firstName: protectionUserDetails?.firstName || "",
          surName: protectionUserDetails?.surName || "",
          dob: protectionUserDetails?.dob || "",
          pid: protectionUserDetails?.pid || "",
        },
      }
      result = await createTicketingBookingService(
        {
          user: userId,
          ticketings: [ticketData],
          bookingReference: "rewards",
          meta: {
            id: reward._id,
            type: "rewards",
          }
        },
        timezone,
        session
      );
      orderDoc = result;


      // Deduct wallet points
      const trx = await createTransactionService(
        {
          user: userId,
          companyOrganizer: reward.companyOrganizer,
          type: "redeem",
          domainType: "ticketingorders",
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

    } else {
      // Create order
      [orderDoc] = await RewardsOrders.create(
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
      const trx = await createTransactionService(
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
    }
    await session.commitTransaction();
    session.endSession();

    /* SEND NOTIFICATION IN BACKGROUND */
    sendUserNotifications({
      recipientIds: [userId.toString()],
      title: `Claimed reward ${reward.title}`,
      body: `You have successfully claimed the reward ${reward.title} using ${reward.minPointsRequiredToClaim || 0} points.`,
      data: { type: NotificationTypes.REWARD_CLAIMED, rewardId: reward._id, objectType: "loyaltyrewardsorders" },
      sender: orderDoc.companyOrganizer,
      objectId: orderDoc._id,
      image: reward.image || null,

    });

    return { success: true, order: orderDoc, transactions: trx?.transactions };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
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


const getOrderDetails = async (orderId) => {
  const _id = new mongoose.Types.ObjectId(orderId);

  const pipeline = [
    { $match: { _id } },

    // ---- Organizer populate ----
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        pipeline: [
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

    // ---- Ticket populate ----
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

    // inject populated ticket
    {
      $addFields: {
        "snapshot.reward.specialTicket.ticket": "$ticketDetails",
      },
    },

    // cleanup
    {
      $project: {
        ticketObjectId: 0,
        ticketDetails: 0,
      },
    },
  ];

  const result = await RewardsOrders.aggregate(pipeline);
  return result[0] || null;
};

/* 
Fetches both loyalty/global reward orders together
*/
const getCombinedRewardOrders = async ({
  userId,
  status,
  keyword,
  skip,
  limit,
  sort = -1
}) => {
  const baseMatch = {
    user: new mongoose.Types.ObjectId(userId),
  };

  if (status) baseMatch.status = status;

  if (keyword) {
    baseMatch["snapshot.title"] = {
      $regex: keyword,
      $options: "i"
    };
  }

  const pipeline = [
    { $match: baseMatch },

    // identify source
    {
      $addFields: {
        rewardScope: "company"
      }
    },

    // ---- populate organizer ----
    {
      $lookup: {
        from: "users",
        let: { organizerId: "$companyOrganizer" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$organizerId"] }
            }
          },
          {
            $project: {
              _id: 1,
              "companyDetails.loyaltySettings.title": 1,
              "companyDetails.logo": 1
            }
          }
        ],
        as: "companyOrganizer"
      }
    },
    {
      $unwind: {
        path: "$companyOrganizer",
        preserveNullAndEmptyArrays: true
      }
    },

    // ---- merge global orders ----
    {
      $unionWith: {
        coll: "globalrewardsorders",
        pipeline: [
          { $match: baseMatch },
          {
            $addFields: {
              rewardScope: "global",
              companyOrganizer: null
            }
          }
        ]
      }
    },

    // ---- unified sorting ----
    { $sort: { createdAt: sort } },

    // ---- pagination ----
    {
      $facet: {
        data: [
          { $skip: skip },
          ...(limit !== 0 ? [{ $limit: limit }] : [])
        ],
        total: [{ $count: "count" }]
      }
    }
  ];

  const result = await RewardsOrders.aggregate(pipeline);

  const data = result[0]?.data || [];
  const total = result[0]?.total?.[0]?.count || 0;

  return { data, total };
};

const completeRewardOrder = async ({
  orderId,
  redeemedBy,
  status,
  companyOrganizer,
}) => {
  const order = await RewardsOrders.findById(orderId);

  if (!order) {
    return { error: "reward_order_not_found" };
  }

  const warnings = [];

  /* ===============================
     1️⃣ Organizer validation
  =============================== */
  if (
    companyOrganizer &&
    order.companyOrganizer &&
    order.companyOrganizer.toString() !== companyOrganizer.toString()
  ) {
    return { error: "organizer_mismatch" };
  }

  /* ===============================
     2️⃣ Already completed guard
  =============================== */
  if (order.status === "completed") {
    warnings.push({
      warning: "Reward already redeemed",
      warningCode: "already_redeemed",
    });

    return {
      order,
      warnings,
      wasCompletedNow: false,
    };
  }

  /* ===============================
     3️⃣ Apply requested status
  =============================== */
  order.status = status || "completed";

  if (order.status === "completed") {
    order.redeemedAt = new Date();
    order.redeemedBy = redeemedBy;
  }

  await order.save();

  return {
    order,
    warnings,
    wasCompletedNow: order.status === "completed",
  };
};


module.exports = {
  createRewardOrder,
  getUserOrders,
  getRewardOrdersCounts,
  checkClaimLimitForLoyaltyRewards,
  getOrderDetails,
  getCombinedRewardOrders,
  completeRewardOrder
};
