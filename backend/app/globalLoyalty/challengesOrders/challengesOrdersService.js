const challengesRepo =
  require("../challenges/challengesRepository");
const ordersRepo =
  require("./challengesOrdersRepository");

const { sendUserNotifications } = require("../../../controllers/communicationController");
const { getChallengeNotificationTitle } = require("../../../helperUtils/challengeNotificationTitle");
const { NotificationTypes } = require("@NotificationsModel");
const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
const { GlobalRewardsOrders } = require("@GlobalRewardsOrdersModel");
const { createTicketingBookingService } = require("../../bookings/ticketings/ticketingBookingService");
const { createTransactionService } =
  require("../../userWalletService/transactions/services/unifiedTransactionsService");
const TicketingsModel = require("@TicketingsModel");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");

const mongoose = require("mongoose");

const resolveTicketId = (rawTicket) => {
  if (!rawTicket) return null;
  if (mongoose.Types.ObjectId.isValid(rawTicket)) return rawTicket;
  if (
    typeof rawTicket === "object" &&
    mongoose.Types.ObjectId.isValid(rawTicket._id)
  ) {
    return rawTicket._id;
  }
  return null;
};

/**
 * Prefer challenge-configured timeSlot; otherwise first available slot
 * when the ticket requires timingSlots.
 */
const resolveChallengeTimeSlot = (ticketDoc, configuredTimeSlot) => {
  if (configuredTimeSlot) return String(configuredTimeSlot);

  if (!ticketDoc?.timingSlots?.enabled) return null;

  const slots = (ticketDoc.timingSlots.dateTimeSlots || []).flatMap(
    (day) => day.timeSlots || []
  );

  const available = slots.find((slot) => (slot.quantity ?? 0) > 0) || slots[0];
  return available?._id ? String(available._id) : null;
};

/**
 * Issue reward when a global challenge completes.
 * - specialTicket → TicketingOrder (+ meta) linked on challenge order
 * - points → global wallet earn
 * - customReward → GlobalRewardsOrders (pending)
 */
const issueGlobalChallengeReward = async ({
  userId,
  challenge,
  order,
  timezone,
  session,
}) => {
  const reward = challenge?.reward || {};
  const rewardType = reward.rewardType;

  if (rewardType === "specialTicket") {
    let ticketOrderId = null;
    let ticketStatus = "failed";

    try {
      const ticketId = resolveTicketId(reward.specialTicket?.ticket);
      if (!ticketId) {
        return { ticketOrderId, ticketStatus };
      }

      const ticketDoc = await TicketingsModel.findById(ticketId)
        .session(session)
        .lean();

      if (!ticketDoc) {
        return { ticketOrderId, ticketStatus };
      }

      const timeSlot = resolveChallengeTimeSlot(
        ticketDoc,
        reward.specialTicket?.timeSlot
      );

      if (ticketDoc.timingSlots?.enabled && !timeSlot) {
        throw new Error("challenge_ticket_time_slot_required");
      }

      let isFastTrack = Boolean(reward.specialTicket?.isFastTrack);
      let bookingResult;

      try {
        bookingResult = await createTicketingBookingService(
          {
            user: userId,
            ticketings: [
              {
                ticketId,
                timeSlot,
                isFastTrack,
                protectionUserDetails: {
                  firstName: "n/a",
                  surName: "n/a",
                  dob: "n/a",
                  pid: "n/a",
                },
              },
            ],
            bookingReference: "globalchallengeorders",
            meta: {
              id: order._id,
              type: "globalchallengeorders",
              source: "globalLoyalty",
              challengeId: challenge._id,
              challengeOrderId: order._id,
              rewardType: "specialTicket",
            },
          },
          timezone,
          session
        );
      } catch (fastTrackErr) {
        // Retry without fast-track if that was the only blocker
        if (!isFastTrack) throw fastTrackErr;

        bookingResult = await createTicketingBookingService(
          {
            user: userId,
            ticketings: [
              {
                ticketId,
                timeSlot,
                isFastTrack: false,
                protectionUserDetails: {
                  firstName: "n/a",
                  surName: "n/a",
                  dob: "n/a",
                  pid: "n/a",
                },
              },
            ],
            bookingReference: "globalchallengeorders",
            meta: {
              id: order._id,
              type: "globalchallengeorders",
              source: "globalLoyalty",
              challengeId: challenge._id,
              challengeOrderId: order._id,
              rewardType: "specialTicket",
              fastTrackFallback: true,
            },
          },
          timezone,
          session
        );
      }

      const issuedOrder = bookingResult?.order || bookingResult;
      if (issuedOrder?._id) {
        ticketOrderId = issuedOrder._id;
        ticketStatus = "issued";
      }
    } catch (err) {
      console.error("[GLOBAL] Ticket creation failed (non-blocking)", {
        challengeId: challenge._id,
        challengeOrderId: order._id,
        error: err.message,
      });
    }

    return { ticketOrderId, ticketStatus };
  }

  if (rewardType === "points") {
    const points = reward.rewardValue || 0;
    if (points > 0) {
      const trx = await createTransactionService(
        {
          user: userId,
          type: "earn",
          domainType: "globalchallengeorders",
          entityId: order._id,
          globalPoints: {
            base: points,
            total: points,
          },
          allowNegative: false,
          description: `Points awarded for completing global challenge: ${challenge.title}`,
        },
        session
      );

      if (!trx?.success) {
        throw new Error(trx?.message || "challenge_reward_transaction_failed");
      }
    }
    return { ticketOrderId: null, ticketStatus: null };
  }

  if (rewardType === "customReward") {
    const existing = await GlobalRewardsOrders.findOne({
      user: userId,
      sourceType: "globalchallengeorders",
      sourceId: order._id,
    }).session(session);

    if (!existing) {
      const custom = reward.customReward || {};
      await GlobalRewardsOrders.create(
        [
          {
            user: userId,
            sourceType: "globalchallengeorders",
            sourceId: order._id,
            snapshot: {
              title: custom.title || challenge.title,
              image: custom.image || custom.media || challenge.image || "",
              description: custom.description || challenge.description || "",
              rewardType: "customReward",
              customReward: custom,
              minPointsRequiredToClaim: 0,
              fromChallenge: true,
              challengeId: challenge._id,
              challengeTitle: challenge.title,
            },
            pointsUsed: 0,
            status: "pending",
          },
        ],
        { session }
      );
    }

    return { ticketOrderId: null, ticketStatus: null };
  }

  return { ticketOrderId: null, ticketStatus: null };
};

const resolveGlobalChallengeByTaskTypeService = async ({
  userId,
  taskType,
  value = 1,
  timezone = "UTC",
  req = null,
}) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    let remaining = value;

    const buffer = {
      started: [],
      milestones: [],
      completed: []
    };

    const challenges =
      await challengesRepo.getActiveGlobalChallenges({ timezone });

    // Enforce global tier eligibility (same rule as list API)
    const wallet = await getUserWallet(userId);
    const userTierEntry = wallet?.global?.level?.entryPoints ?? 0;

    const eligible = challenges
      .filter(ch => ch.taskType === taskType)
      .filter((ch) => {
        const requiredEntry = ch?.tierLimit?.entryPoints ?? 0;
        return userTierEntry >= requiredEntry;
      })
      .sort((a, b) =>
        (a.taskValue ?? 1) - (b.taskValue ?? 1) ||
        new Date(a.createdAt) - new Date(b.createdAt)
      );

    if (!eligible.length) {
      await session.commitTransaction();
      session.endSession();
      return { success: false, message: "no_active_global_challenge" };
    }

    const challengeIds = eligible.map(ch => ch._id);

    const activeOrdersMap =
      await ordersRepo.getActiveGlobalOrdersForChallenges({
        userId,
        challengeIds,
        session
      });

    const completedCountsMap =
      await ordersRepo.getCompletedCountsForChallenges({
        userId,
        challengeIds,
        session
      });

    const bulkOperations = [];

    for (const challenge of eligible) {

      if (remaining <= 0) break;

      const target = challenge.taskValue ?? 1;
      const maxCycles =
        challenge.claimLimit === null
          ? Infinity
          : challenge.claimLimit;

      if (maxCycles === 0) continue;

      const challengeKey = challenge._id.toString();

      let completedCycles =
        completedCountsMap.get(challengeKey) || 0;

      let order =
        activeOrdersMap.get(challengeKey) || null;

      while (remaining > 0 && completedCycles < maxCycles) {

        if (!order) {
          order = await ordersRepo.createGlobalChallengeOrder({
            user: userId,
            challenge: challenge._id,
            challengeSnapshot: challenge,
            progress: { current: 0, target },
            status: "in-progress"
          }, session);

          activeOrdersMap.set(challengeKey, order);

          buffer.started.push({
            challenge,
            orderId: order._id
          });
        }

        // 🔒 FIX 1: Skip already completed orders
        if (order && order.status === "completed") {
          break;
        }

        const capacity = target - order.progress.current;

        if (capacity <= 0) {
          completedCycles++;
          completedCountsMap.set(challengeKey, completedCycles);
          activeOrdersMap.delete(challengeKey);
          order = null;
          continue;
        }

        const applied = Math.min(remaining, capacity);
        const previousCurrent = order.progress.current;
        const newCurrent = previousCurrent + applied;

        remaining -= applied;
        order.progress.current = newCurrent;

        const isCompleted = newCurrent >= target;

        // =============================
        // COMPLETION
        // =============================

        if (isCompleted) {

          const { ticketOrderId, ticketStatus } =
            await issueGlobalChallengeReward({
              userId,
              challenge,
              order,
              timezone,
              session,
            });

          bulkOperations.push({
            updateOne: {
              filter: {
                _id: order._id,
                status: { $ne: "completed" } // idempotent
              },
              update: {
                status: "completed",
                rewardClaimed: true,
                rewardClaimedAt: new Date(),
                rewardTicketOrder: ticketOrderId,
                ticketStatus,
                "progress.current": target
              }
            }
          });

          // 🔒 FIX 2: Only notify if it wasn't already completed
          if (order.status !== "completed") {
            buffer.completed.push({
              challenge,
              orderId: order._id
            });
          }

          completedCycles++;
          completedCountsMap.set(challengeKey, completedCycles);
          activeOrdersMap.delete(challengeKey);
          order = null;

          continue;
        }

        // =============================
        // STILL IN PROGRESS
        // =============================

        bulkOperations.push({
          updateOne: {
            filter: { _id: order._id },
            update: {
              "progress.current": newCurrent,
              status: "in-progress"
            }
          }
        });

        break;
      }
    }

    if (bulkOperations.length > 0) {
      await GlobalChallengesOrders.bulkWrite(
        bulkOperations,
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    await flushGlobalNotifications({
      userId,
      buffer,
      req,
    });

    return {
      success: true,
      remaining
    };

  } catch (err) {

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    session.endSession();



    return {
      success: false,
      message: err.message
    };
  }
};



const flushGlobalNotifications = async ({
  userId,
  buffer,
  req = null,
}) => {

  const sendSingle = async ({
    title,
    body,
    titleKey,
    titleValues,
    bodyKey,
    bodyValues,
    type,
    orderId
  }) => {
    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title,
      body,
      titleKey,
      titleValues,
      bodyKey,
      bodyValues,
      req,
      data: {
        type,
        objectType: "globalchallengeorders"
      },
      sender: null,
      objectId: orderId
    });
  };

  const sendBatch = async ({
    title,
    body,
    titleKey,
    bodyKey,
    bodyValues,
    type,
    orders
  }) => {

    const ids = orders.map(o => o.orderId.toString());

    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title,
      body,
      titleKey,
      bodyKey,
      bodyValues,
      req,
      data: {
        type,
        objectType: "globalchallengeorders"
      },
      sender: null,
      meta: {
        globalChallengeOrderIds: ids,
        count: ids.length
      }
    });
  };

  // If a challenge starts and completes in the same resolve, only send completed.
  const completedOrderIds = new Set(
    (buffer.completed || []).map((o) => String(o.orderId))
  );
  const completedChallengeIds = new Set(
    (buffer.completed || []).map((o) =>
      String(o.challenge?._id || o.challenge)
    )
  );

  const notAlsoCompleted = (o) => {
    const orderId = String(o.orderId);
    const challengeId = String(o.challenge?._id || o.challenge);
    return (
      !completedOrderIds.has(orderId) &&
      !completedChallengeIds.has(challengeId)
    );
  };

  buffer.started = (buffer.started || []).filter(notAlsoCompleted);
  buffer.milestones = (buffer.milestones || []).filter(notAlsoCompleted);

  // =========================
  // COMPLETED (Highest Priority)
  // =========================

  if (buffer.completed.length > 0) {

    // 🔒 Defensive validation — ensure orders are actually completed in DB
    const orderIds = buffer.completed.map(o => o.orderId);

    const validCompletedOrders =
      await GlobalChallengesOrders.find({
        _id: { $in: orderIds },
        status: "completed"
      }).select("_id").lean();

    const validIdsSet = new Set(
      validCompletedOrders.map(o => o._id.toString())
    );

    const filteredCompleted =
      buffer.completed.filter(o =>
        validIdsSet.has(o.orderId.toString())
      );

    if (filteredCompleted.length === 1) {

      const { challenge, orderId } = filteredCompleted[0];

      await sendSingle({
        ...getChallengeNotificationTitle({
          ...challenge,
          title: challenge.title || challenge.name,
        }),
        bodyKey: "global_challenge_completed_body",
        type: NotificationTypes.GLOBAL_CHALLENGE_COMPLETED,
        orderId
      });
    }

    if (filteredCompleted.length > 1) {

      await sendBatch({
        titleKey: "global_challenge_batch_completed_title",
        bodyKey: "global_challenge_batch_completed_body",
        bodyValues: { count: filteredCompleted.length },
        type: NotificationTypes.GLOBAL_CHALLENGE_BATCH_UPDATE,
        orders: filteredCompleted
      });
    }
  }

  // =========================
  // STARTED
  // =========================

  if (buffer.started.length === 1) {

    const { challenge, orderId } = buffer.started[0];

    await sendSingle({
      ...getChallengeNotificationTitle({
        ...challenge,
        title: challenge.title || challenge.name,
      }),
      bodyKey: "global_challenge_started_body",
      type: NotificationTypes.GLOBAL_CHALLENGE_STARTED,
      orderId
    });
  }

  if (buffer.started.length > 1) {

    await sendBatch({
      titleKey: "global_challenge_batch_started_title",
      bodyKey: "global_challenge_batch_started_body",
      bodyValues: { count: buffer.started.length },
      type: NotificationTypes.GLOBAL_CHALLENGE_BATCH_UPDATE,
      orders: buffer.started
    });
  }

  // =========================
  // MILESTONES
  // =========================

  if (buffer.milestones.length === 1) {

    const { challenge, milestone, orderId } =
      buffer.milestones[0];

    await sendSingle({
      ...getChallengeNotificationTitle({
        ...challenge,
        title: challenge.title || challenge.name,
      }),
      bodyKey: "global_challenge_milestone_body",
      bodyValues: { percentage: milestone },
      type: NotificationTypes.GLOBAL_CHALLENGE_PROGRESS_MILESTONE,
      orderId
    });
  }

  if (buffer.milestones.length > 1) {

    await sendBatch({
      titleKey: "global_challenge_batch_milestones_title",
      bodyKey: "global_challenge_batch_milestones_body",
      bodyValues: { count: buffer.milestones.length },
      type: NotificationTypes.GLOBAL_CHALLENGE_BATCH_UPDATE,
      orders: buffer.milestones
    });
  }
};

module.exports = {
  resolveGlobalChallengeByTaskTypeService
};
