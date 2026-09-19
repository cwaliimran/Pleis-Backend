const mongoose = require("mongoose");
const GlobalReward = require("@GlobalLoyaltyReward");
const { GlobalRewardsOrders } = require("@GlobalRewardsOrdersModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { createTransactionService } =
  require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { createTicketingBookingService } = require("../../bookings/ticketings/ticketingBookingService");

/**
 * CLAIM GLOBAL REWARD
 * Creates reward order + deducts global points atomically
 * @param {object} [opts.session] - optional existing mongoose session
 * @param {boolean} [opts.skipPointsCharge] - when points already charged (e.g. promotion claim)
 * @param {object} [opts.metaExtra] - extra ticketing order meta fields
 */
const createGlobalRewardOrder = async ({
  userId,
  rewardId,
  protectionUserDetails,
  timezone,
  session: externalSession = null,
  skipPointsCharge = false,
  metaExtra = {},
}) => {
  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());
  if (ownsSession) {
    session.startTransaction();
  }

  try {
    const reward = await GlobalReward.findById(rewardId).session(session).lean();

    if (!reward) throw new Error("reward_not_found");
    if (reward.status !== "active") throw new Error("reward_not_active");
    if (reward.endDate && reward.endDate < new Date())
      throw new Error("reward_expired");

    const [limitCheck] =
      await checkClaimLimitForGlobalRewards(userId, [reward]);

    if (!limitCheck.available)
      throw new Error("reward_claim_limit_reached");

    let orderPayload = null;
    let trx = null;

    /* ===============================
       🎟 GLOBAL TICKET REWARD
    =============================== */
    if (reward.rewardType === "globalTicketReward") {
      // Admin must set timeSlot at reward creation when ticket uses timing slots
      const timeSlot = reward.timeSlot || reward.timeslot || null;
      if (!timeSlot) {
        const TicketingsModel = require("@TicketingsModel");
        const ticketDoc = await TicketingsModel.findById(reward.ticket)
          .session(session)
          .lean();
        if (ticketDoc?.timingSlots?.enabled) {
          throw new Error("reward_time_slot_required");
        }
      }

      const ticketData = {
        ticketId: reward.ticket,
        timeSlot,
        isFastTrack: reward.isFastTrack || false,
        protectionUserDetails: {
          firstName: protectionUserDetails?.firstName || "",
          surName: protectionUserDetails?.surName || "",
          dob: protectionUserDetails?.dob || "",
          pid: protectionUserDetails?.pid || "",
        },
      };

      const result = await createTicketingBookingService(
        {
          user: userId,
          ticketings: [ticketData],
          bookingReference: "globalrewards",
          meta: {
            id: reward._id,
            type: "globalrewards",
            source: "globalLoyalty",
            rewardId: reward._id,
            rewardType: reward.rewardType,
            ...metaExtra,
          },
        },
        timezone,
        session
      );

      // normalize structure
      orderPayload = {
        order: result.order,
        tickets: result.tickets || [],
      };

      if (!skipPointsCharge) {
        trx = await createTransactionService(
          {
            user: userId,
            type: "redeem",
            domainType: "globalrewardsorders",
            entityId: result.order._id,
            globalPoints: {
              base: reward.minPointsRequiredToClaim || 0,
              total: -(reward.minPointsRequiredToClaim || 0),
            },
            allowNegative: false,
            description: `Claimed global reward ${reward.title}`,
          },
          session
        );

        if (!trx.success) {
          throw new Error(trx.message || "transaction_failed");
        }
      }

    } else {
      /* ===============================
         🧾 NORMAL GLOBAL REWARD
      =============================== */
      const orderDocs = await GlobalRewardsOrders.create(
        [
          {
            user: userId,
            sourceType: "globalRewards",
            sourceId: reward._id,
            snapshot: reward,
            pointsUsed: skipPointsCharge
              ? 0
              : reward.minPointsRequiredToClaim || 0,
          },
        ],
        { session }
      );

      const orderDoc = orderDocs[0];

      orderPayload = {
        order: orderDoc,
        tickets: [],
      };

      if (!skipPointsCharge) {
        trx = await createTransactionService(
          {
            user: userId,
            type: "redeem",
            domainType: "globalrewardsorders",
            entityId: orderDoc._id,
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
      }
    }

    if (ownsSession) {
      await session.commitTransaction();
      session.endSession();
    }

    return {
      success: true,
      order: orderPayload,
      transactions: trx?.transactions || trx?.data,
    };
  } catch (err) {
    console.log("err", err);

    if (ownsSession) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();
    }

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

  const rewardIds = rewards.map(r => new mongoose.Types.ObjectId(r._id));
  const rewardIdStrings = rewardIds.map(id => String(id));
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Aggregate user claim counts from global reward orders + ticketing orders
  const [rewardOrderCounts, ticketOrderCounts] = await Promise.all([
    GlobalRewardsOrders.aggregate([
      {
        $match: {
          user: userObjectId,
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
    ]),
    TicketingOrders.aggregate([
      {
        $match: {
          user: userObjectId,
          status: { $ne: "cancelled" },
          "meta.type": "globalrewards",
          $or: [
            { "meta.id": { $in: rewardIds } },
            { "meta.id": { $in: rewardIdStrings } },
          ],
        },
      },
      {
        $group: {
          _id: { $toString: "$meta.id" },
          totalClaims: { $sum: 1 },
        },
      },
    ]),
  ]);

  const countMap = new Map();
  for (const c of rewardOrderCounts) {
    countMap.set(String(c._id), c.totalClaims);
  }
  for (const c of ticketOrderCounts) {
    const key = String(c._id);
    countMap.set(key, (countMap.get(key) || 0) + c.totalClaims);
  }

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
        sourceType: { $in: ["globalRewards", "globalchallengeorders"] },
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
