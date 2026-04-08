const challengesRepo =
  require("../challenges/challengesRepository");
const ordersRepo =
  require("./challengesOrdersRepository");

const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
const { createTicketingBookingService } = require("../../bookings/ticketings/ticketingBookingService");

const mongoose = require("mongoose");

const resolveGlobalChallengeByTaskTypeService = async ({
  userId,
  taskType,
  value = 1,
  timezone = "UTC"
}) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const now = new Date();
    let remaining = value;

    const buffer = {
      started: [],
      milestones: [],
      completed: []
    };

    const challenges =
      await challengesRepo.getActiveGlobalChallenges({ now });

    const eligible = challenges
      .filter(ch => ch.taskType === taskType)
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

          let ticketOrderId = null;
          let ticketStatus = null;

          if (challenge.reward?.rewardType === "specialTicket") {

            ticketStatus = "failed";

            try {

              const rawTicket =
                challenge.reward?.specialTicket?.ticket;

              let ticketId = null;

              if (rawTicket) {
                if (mongoose.Types.ObjectId.isValid(rawTicket)) {
                  ticketId = rawTicket;
                } else if (
                  typeof rawTicket === "object" &&
                  mongoose.Types.ObjectId.isValid(rawTicket._id)
                ) {
                  ticketId = rawTicket._id;
                }
              }

              if (ticketId) {

                const bookingResult =
                  await createTicketingBookingService(
                    {
                      user: userId,
                      ticketings: [
                        {
                          ticketId,
                          timeSlot:
                            challenge.reward.specialTicket.timeSlot || null,
                          isFastTrack: challenge.reward.specialTicket.isFastTrack || false,
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
                      },
                    },
                    timezone,
                    session
                  );

                if (bookingResult?._id) {
                  ticketOrderId = bookingResult._id;
                  ticketStatus = "issued";
                }
              }

            } catch (err) {
              console.error(
                "[GLOBAL] Ticket creation failed (non-blocking)",
                {
                  challengeId: challenge._id,
                  error: err.message
                }
              );
            }
          }

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
      buffer
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
  buffer
}) => {

  const sendSingle = async ({
    title,
    body,
    type,
    orderId
  }) => {
    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title,
      body,
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
    type,
    orders
  }) => {

    const ids = orders.map(o => o.orderId.toString());

    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title,
      body,
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
        title: challenge.title,
        body: "Congratulations! You completed this global challenge.",
        type: NotificationTypes.GLOBAL_CHALLENGE_COMPLETED,
        orderId
      });
    }

    if (filteredCompleted.length > 1) {

      await sendBatch({
        title: "Multiple Global Challenges Completed 🎉",
        body: `🎉 ${filteredCompleted.length} global challenges completed successfully!`,
        type: NotificationTypes.GLOBAL_CHALLENGE_BATCH_UPDATE,
        orders: filteredCompleted
      });
    }

    // Suppress started + milestone if valid completion exists
    if (filteredCompleted.length > 0) {
      buffer.started = [];
      buffer.milestones = [];
    }
  }

  // =========================
  // STARTED
  // =========================

  if (buffer.started.length === 1) {

    const { challenge, orderId } = buffer.started[0];

    await sendSingle({
      title: challenge.title,
      body: "Your global challenge has started. Good luck!",
      type: NotificationTypes.GLOBAL_CHALLENGE_STARTED,
      orderId
    });
  }

  if (buffer.started.length > 1) {

    await sendBatch({
      title: "New Global Challenges Started",
      body: `🚀 ${buffer.started.length} global challenges started.`,
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
      title: challenge.title,
      body: `You're ${milestone}% done! Keep going.`,
      type: NotificationTypes.GLOBAL_CHALLENGE_PROGRESS_MILESTONE,
      orderId
    });
  }

  if (buffer.milestones.length > 1) {

    await sendBatch({
      title: "Global Challenge Milestones Reached",
      body: `🔥 ${buffer.milestones.length} milestone(s) reached.`,
      type: NotificationTypes.GLOBAL_CHALLENGE_BATCH_UPDATE,
      orders: buffer.milestones
    });
  }
};

module.exports = {
  resolveGlobalChallengeByTaskTypeService
};
