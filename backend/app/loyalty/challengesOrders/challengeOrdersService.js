const repo = require("./challengeOrdersRepository");
const { generateMeta } = require("@utils/responseUtil");
const { formatChallenge } = require("./formatters/formatChallenge");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { findBestActiveChallengeByTaskType } = require("../challenges/challengesRepository");
const { Challenge } = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { createTransactionService } = require(
  "../../userWalletService/transactions/services/unifiedTransactionsService"
);
const TicketingsModel = require("@TicketingsModel"); // adjust path if needed
const MenuItems = require("@MenuItemsModel");
const Reward = require("@RewardModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");

const mongoose = require("mongoose");
const { createTicketingBookingService } = require("../../bookings/ticketings/ticketingBookingService");

/**
 * Issue a pending loyalty reward order from a completed challenge
 * (menuItem / customReward / linkedReward). Points & tickets are handled separately.
 */
const issueChallengeRewardOrder = async ({
  lockedOrder,
  challenge,
  session,
}) => {
  const reward = challenge?.reward || {};
  const rewardType = reward.rewardType;
  const companyOrganizer = challenge.companyOrganizer;
  const userId = lockedOrder.user;

  // Avoid double-issuing if completion is retried
  const existing = await RewardsOrders.findOne({
    user: userId,
    sourceType: "loyaltychallengesorders",
    sourceId: lockedOrder._id,
  }).session(session);

  if (existing) return existing;

  let snapshot = null;

  if (rewardType === "linkedReward") {
    const linkedId = reward.linkedReward?._id || reward.linkedReward;
    if (!linkedId) {
      throw new Error("challenge_linked_reward_missing");
    }

    // Register discriminators (buyMenuItemReward / customReward / ticketReward)
    require("../../../commonModules/loyalty/rewards/models/index");

    const linkedReward = await Reward.findById(linkedId).session(session).lean();

    if (!linkedReward) {
      throw new Error("challenge_linked_reward_not_found");
    }

    if (linkedReward.menuItem) {
      linkedReward.menuItem = await MenuItems.findById(linkedReward.menuItem)
        .session(session)
        .lean();
    }

    snapshot = {
      ...linkedReward,
      fromChallenge: true,
      challengeId: challenge._id,
      challengeTitle: challenge.title,
    };
  } else if (rewardType === "menuItem") {
    const menuItemIds = (reward.rewardMenuItem || [])
      .map((item) => item?._id || item)
      .filter(Boolean);

    const menuItems = menuItemIds.length
      ? await MenuItems.find({ _id: { $in: menuItemIds } })
          .session(session)
          .lean()
      : [];

    snapshot = {
      title: challenge.title,
      image: challenge.image || "",
      description: challenge.description || "",
      rewardType: "buyMenuItemReward",
      menuItem: menuItems.length === 1 ? menuItems[0] : menuItems,
      companyOrganizer,
      minPointsRequiredToClaim: 0,
      fromChallenge: true,
      challengeId: challenge._id,
      challengeTitle: challenge.title,
    };
  } else if (rewardType === "customReward") {
    snapshot = {
      title: reward.customReward?.title || challenge.title,
      image: reward.customReward?.image || challenge.image || "",
      description: reward.customReward?.description || challenge.description || "",
      rewardType: "customReward",
      customReward: reward.customReward || {},
      companyOrganizer,
      minPointsRequiredToClaim: 0,
      fromChallenge: true,
      challengeId: challenge._id,
      challengeTitle: challenge.title,
    };
  } else {
    return null;
  }

  const [orderDoc] = await RewardsOrders.create(
    [
      {
        user: userId,
        companyOrganizer,
        sourceType: "loyaltychallengesorders",
        sourceId: lockedOrder._id,
        snapshot,
        pointsUsed: 0,
        status: "pending",
      },
    ],
    { session }
  );

  return orderDoc;
};

/**
 * Unified challenge progress service.
 * - Creates challenge order on first action
 * - Increments progress
 * - Marks challenge complete when progress meets target
 * - Issues reward if applicable
 */
const updateChallengeProgressByTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1
}) => {

  const challenge =
    await findBestActiveChallengeByTaskType({
      companyOrganizer,
      taskType
    });

  if (!challenge) {
    return { success: false, message: "no_active_challenge_found" };
  }

  const existingOrder = await LoyaltyChallengesOrders.findOne({
    user: userId,
    challenge: challenge._id,
    status: "in-progress"
  }).lean();

  let order = await repo.startOrGetChallengeOrder({
    userId,
    challenge
  });

  if (!order) {
    return { success: false, message: "challenge_claim_limit_reached" };
  }

  if (!existingOrder) {
    void sendUserNotifications({
      recipientIds: [userId.toString()],
      title: challenge.title,
      body: "Your challenge has started. Good luck!",
      data: {
        type: NotificationTypes.CHALLENGE_STARTED,
        objectType: "challengesorders"
      },
      sender: companyOrganizer,
      objectId: order._id
    });
  }

  const previousCurrent = order.progress.current;

  const updated = await repo.incrementChallengeProgress({
    userId,
    challengeId: challenge._id,
    value
  });

  if (!updated) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  // 🔥 Milestone handler
  await handleChallengeMilestones({
    previousCurrent,
    updatedOrder: updated,
    challenge,
    userId,
    companyOrganizer
  });

  // ✅ Check for completion when progress reaches target
  if (updated.progress.current >= updated.progress.target && updated.status === "in-progress") {
    await finalizeChallengeCompletion(updated);
  }

  return { success: true, order: updated };
};


// Get user challenge orders with pagination + filters
const getUserChallengeOrdersService = async ({
  userId,
  page = 1,
  limit = 10,
  status,
  keyword,
  sort = "desc"
}) => {
  const query = { user: userId };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  if (keyword) {
    query["challengeSnapshot.title"] = { $regex: keyword, $options: "i" };
  }

  const sortQuery = { createdAt: sort === "asc" ? 1 : -1 };

  const [orders, counts] = await Promise.all([
    repo.getUserChallengeOrders(query, page, limit, sortQuery),
    repo.getChallengeOrdersCounts(query, { status: ["in-progress", "completed", "expired"] })
  ]);

  const meta = generateMeta(page, limit, counts.totalFiltered);
  meta.challengeOrderCounts = counts;

  const formattedOrders = orders.map(order => {
    const formatted = formatChallenge(order);
    return formatted;
  });

  return { orders: formattedOrders, meta };
};



/**
 * Resolve challenge dynamically by taskType
 */
const resolveChallengeByTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1,
  items = []
}) => {
  if (taskType === "buyMenuItem") {
    return resolveBuyMenuItemChallengeService({
      userId,
      companyOrganizer,
      items
    });
  }

  return resolveGenericTaskTypeService({
    userId,
    companyOrganizer,
    taskType,
    value
  });
};


const resolveBuyMenuItemChallengeService = async ({
  userId,
  companyOrganizer,
  items = []
}) => {


console.log("resolveBuyMenuItemChallengeService===>", JSON.stringify(items, null, 5));

  const qtyMap = new Map();

  for (const item of items) {
    if (!item.menuItem || !item.quantity) continue;

    qtyMap.set(
      String(item.menuItem),
      (qtyMap.get(String(item.menuItem)) || 0) + Number(item.quantity)
    );
  }


  if (!qtyMap.size) {
   
    return { success: false, message: "menu_item_not_applicable" };
  }

  for (const [menuItemId, incomingQty] of qtyMap.entries()) {

    const purchasedItem = await MenuItems.findById(menuItemId)
      .select("presetType title creator")
      .lean();

    if (!purchasedItem) continue;

    const equivalentMenuItemIds = [purchasedItem._id];

    // Menu items that share presetType + title count toward the same challenge
    if (purchasedItem.presetType && purchasedItem.title) {
      const equivalentItems = await MenuItems.find({
        _id: { $ne: purchasedItem._id },
        presetType: purchasedItem.presetType,
        title: purchasedItem.title,
        creator: purchasedItem.creator
      })
        .select("_id")
        .lean();

      equivalentMenuItemIds.push(...equivalentItems.map((item) => item._id));
    }

    const challenges = await Challenge.find({
      companyOrganizer,
      taskType: "buyMenuItem",
      taskMenuItem: { $in: equivalentMenuItemIds },
      status: "active"
    }).sort({ taskValue: 1, createdAt: 1 });



    for (const challenge of challenges) {
      const existingOrder = await LoyaltyChallengesOrders.findOne({
        user: userId,
        challenge: challenge._id,
        status: "in-progress"
      }).lean();

 

      let order = await repo.startOrGetChallengeOrder({
        userId,
        challenge
      });



      if (!existingOrder) {

        void sendUserNotifications({
          recipientIds: [userId.toString()],
          title: challenge.title,
          body: "Your challenge has started. Good luck!",
          data: {
            type: NotificationTypes.CHALLENGE_STARTED,
            objectType: "loyaltychallengesorders"
          },
          sender: companyOrganizer,
          objectId: order._id
        });
      }

      const previousCurrent = order.progress.current;

      const updated = await repo.incrementChallengeProgress({
        userId,
        challengeId: challenge._id,
        value: incomingQty
      });

      if (!updated) continue;

      // 🔥 Milestone handler
      await handleChallengeMilestones({
        previousCurrent,
        updatedOrder: updated,
        challenge,
        userId,
        companyOrganizer
      });



      if (!updated) {

        continue;
      }

      if (updated.progress.current >= updated.progress.target && updated.status === "in-progress") {


        await finalizeChallengeCompletion(updated);
      } else {
      }
    }
  }



  return { success: true, message: "challenge_progress_updated" };
};

// GENERIC RESOLVER (UNCHANGED LOGIC)
const resolveGenericTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1
}) => {

  let remaining = value;

 

  // 1️⃣ Fetch eligible challenges (easiest first)
  const challenges = await repo.findEligibleChallengesByTaskType({
    companyOrganizer,
    taskType
  });



  if (!challenges.length) {
    return { success: false, message: "no_active_challenge_found" };
  }

  for (const challenge of challenges) {

    if (remaining <= 0) break;



    // 2️⃣ Always try to get active order first
    let order = await repo.startOrGetChallengeOrder({
      userId,
      challenge
    });

 

    if (!order) {

      continue;
    }

    // 3️⃣ If this is a brand new cycle, THEN check claim limit
    if (order.progress.current === 0) {
      const canStart = await repo.canStartNewCycle(userId, challenge);

      if (!canStart) continue;
    }

    // 🔔 Send STARTED if first cycle (do not block progress on notifications)
    if (order.progress.current === 0) {
      void sendUserNotifications({
        recipientIds: [userId.toString()],
        title: challenge.title,
        body: "Your challenge has started. Good luck!",
        data: {
          type: NotificationTypes.CHALLENGE_STARTED,
          objectType: "challengesorders"
        },
        sender: companyOrganizer,
        objectId: order._id
      });
    }

    // 4️⃣ Apply overflow logic (multi-cycle)
    while (remaining > 0) {

      const previousCurrent = order.progress.current;



      const result =
        await repo.incrementChallengeProgressWithOverflow({
          orderId: order._id,
          value: remaining
        });

      if (!result) {

        break;
      }

      const { order: updated, remaining: newRemaining } = result;


      remaining = newRemaining;

      // 🔥 Milestones
      await handleChallengeMilestones({
        previousCurrent,
        updatedOrder: updated,
        challenge,
        userId,
        companyOrganizer
      });

      // ✅ Completion
      if (updated.progress.current >= updated.progress.target && updated.status === "in-progress") {

        await finalizeChallengeCompletion(updated);

        // Only open another cycle when there is leftover progress to apply
        if (remaining <= 0) break;

        // Check if another cycle allowed
        const allowed = await repo.canStartNewCycle(userId, challenge);

        if (!allowed) break;

        // Start next cycle
        order = await repo.startOrGetChallengeOrder({
          userId,
          challenge
        });


        if (!order) break;

        continue; // apply remaining to next cycle
      }

      break; // still in progress, no more cycles
    }
  }



  return { success: true };
};


const isTransientTxnError = (err) =>
  err?.errorLabels?.has?.("TransientTransactionError") ||
  err?.code === 112 ||
  err?.code === 251 ||
  err?.codeName === "NoSuchTransaction" ||
  err?.codeName === "WriteConflict";

const finalizeChallengeCompletion = async (order, { maxRetries = 3 } = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const challenge = order.challengeSnapshot;

      // 🔒 Lock order atomically
      const lockedOrder = await LoyaltyChallengesOrders.findOneAndUpdate(
        { _id: order._id, rewardClaimed: false },
        {
          status: "completed",
          rewardClaimed: true,
          rewardClaimedAt: new Date()
        },
        { new: true, session }
      );

      if (!lockedOrder) {
        await session.abortTransaction();
        session.endSession();
        return { success: true, message: "already_claimed" };
      }

      let ticketOrderId = null;
      let ticketStatus = null;
      let protectionRequired = false;
      let protectionType = null;

      // =====================================================
      // 🎟 SPECIAL TICKET REWARD
      // =====================================================

      if (
        challenge.reward?.rewardType === "specialTicket" &&
        challenge.reward?.specialTicket?.ticket
      ) {
        ticketStatus = "failed";

        const rawTicket =
          challenge.reward.specialTicket.ticket;

        let ticketId = null;

        if (mongoose.Types.ObjectId.isValid(rawTicket)) {
          ticketId = rawTicket;
        } else if (
          typeof rawTicket === "object" &&
          mongoose.Types.ObjectId.isValid(rawTicket._id)
        ) {
          ticketId = rawTicket._id;
        }

        if (ticketId) {
          try {
            // 🔎 Fetch ticket inside same session
            const ticketDoc = await TicketingsModel.findById(
              ticketId,
              null,
              { session }
            ).lean();

            if (ticketDoc && ticketDoc.resaleProtection !== "none") {
              protectionRequired = true;
              protectionType = ticketDoc.resaleProtection;
            }

            const bookingResult =
              await createTicketingBookingService(
                {
                  user: lockedOrder.user,
                  ticketings: [
                    {
                      ticketId,
                      timeSlot:
                        challenge.reward.specialTicket.timeSlot || null,
                      isFastTrack:
                        challenge.reward.specialTicket.isFastTrack || false,
                      protectionUserDetails: {
                        firstName: "n/a",
                        surName: "n/a",
                        dob: "n/a",
                        pid: "n/a"
                      }
                    }
                  ],
                  bookingReference: "loyaltychallengesorders",
                  meta: {
                    id: challenge._id,
                    type: "loyaltychallengesorders"
                  }
                },
                "UTC",
                session
              );

            if (bookingResult?._id) {
              ticketOrderId = bookingResult._id;
              ticketStatus = "issued";
            }

          } catch (err) {
            console.error(
              "[LOYALTY] Ticket creation failed",
              {
                challengeId: challenge._id,
                error: err.message
              }
            );
          }

        }

        // Persist ticket result
        if (ticketStatus !== null) {
          await LoyaltyChallengesOrders.updateOne(
            { _id: lockedOrder._id },
            {
              rewardTicketOrder: ticketOrderId,
              ticketStatus
            },
            { session }
          );
        }


        // =====================================================
        // 🔐 PROTECTION DETAILS NOTIFICATION
        // =====================================================
        if (ticketStatus === "issued" && protectionRequired) {

          let protectionMessage = "";

          if (protectionType === "nameSurname") {
            protectionMessage =
              "Please enter the attendee's name and surname to activate your ticket.";
          }

          if (protectionType === "nameSurnamePid") {
            protectionMessage =
              "Please enter the attendee's name, surname, and PID to activate your ticket.";
          }

          sendUserNotifications({
            recipientIds: [lockedOrder.user.toString()],
            title: "Additional Ticket Details Required",
            body: protectionMessage,
            data: {
              type: NotificationTypes.TICKET_PROTECTION_REQUIRED,
              objectType: "ticketingorders",
              challengeOrderId: lockedOrder._id,
              ticketOrderId
            },
            sender: challenge.companyOrganizer,
            objectId: ticketOrderId
          });
        }

      } else if (challenge.reward?.rewardType === "points") {


        // =====================================================
        // 💎 POINTS REWARD
        // =====================================================

        const points = challenge.reward.rewardValue || 0;

        if (points > 0) {
          const trx = await createTransactionService(
            {
              user: lockedOrder.user,
              companyOrganizer: challenge.companyOrganizer,
              companyPoints: {
                base: points,
                multiplier: 1,
                total: points,
                pointsPerEuro: 1
              },
              allowNegative: false,
              type: "earn",
              description: `Points awarded for completing challenge: ${challenge.title}`,
              entityId: lockedOrder._id,
              domainType: "loyaltychallengesorders"
            },
            session
          );

          if (!trx?.success) {
            throw new Error(trx?.message || "challenge_reward_transaction_failed");
          }
        }
      } else if (
        ["menuItem", "customReward", "linkedReward"].includes(
          challenge.reward?.rewardType
        )
      ) {
        // =====================================================
        // 🎁 MENU / CUSTOM / LINKED REWARD → loyalty reward order
        // =====================================================
        await issueChallengeRewardOrder({
          lockedOrder,
          challenge,
          session,
        });
      }

      await session.commitTransaction();
      session.endSession();

      // =====================================================
      // 🔔 COMPLETION NOTIFICATION
      // =====================================================
      sendUserNotifications({
        recipientIds: [lockedOrder.user.toString()],
        title: challenge.title,
        body: "Congratulations! Your challenge has been completed.",
        data: {
          type: NotificationTypes.CHALLENGE_COMPLETED,
          objectType: "challengesorders"
        },
        sender: challenge.companyOrganizer,
        objectId: lockedOrder._id
      });


      return { success: true };

    } catch (err) {
      lastError = err;

      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (_) {
          /* already aborted by server */
        }
      }
      session.endSession();

      if (isTransientTxnError(err) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }

      console.error("[LOYALTY] Completion transaction failed", err);

      return {
        success: false,
        message: err.message
      };
    }
  }

  return {
    success: false,
    message: lastError?.message || "challenge_completion_failed"
  };
};

/**
 * ==========================================
 * Challenge Milestone Notification Utility
 * ==========================================
 *
 * Rules:
 * - Only send if milestone is crossed in this update
 * - Do NOT send if challenge completed in same update
 * - Atomic protection via milestonesSent
 */
const handleChallengeMilestones = async ({
  previousCurrent = 0,
  updatedOrder,
  challenge,
  userId,
  companyOrganizer
}) => {

  const target = updatedOrder.progress.target;

  const previousPercentage = Math.floor(
    (previousCurrent / target) * 100
  );

  const currentPercentage = Math.floor(
    (updatedOrder.progress.current / target) * 100
  );

  const isCompleted =
    updatedOrder.progress.current >= target;

  const milestoneTargets = [50, 80];

  for (const milestone of milestoneTargets) {

    const crossedMilestone =
      previousPercentage < milestone &&
      currentPercentage >= milestone;

    // 🚫 Do NOT send milestone if completed in same update
    if (!crossedMilestone || isCompleted) continue;

    const milestoneUpdate =
      await LoyaltyChallengesOrders.findOneAndUpdate(
        {
          _id: updatedOrder._id,
          milestonesSent: { $ne: milestone }
        },
        { $addToSet: { milestonesSent: milestone } }
      );

    if (milestoneUpdate) {
      void sendUserNotifications({
        recipientIds: [userId.toString()],
        title: challenge.title,
        body: `You're ${milestone}% done! Keep going.`,
        data: {
          type: NotificationTypes.CHALLENGE_PROGRESS_MILESTONE,
          objectType: "challengesorders",
          percentage: milestone
        },
        sender: companyOrganizer,
        objectId: updatedOrder._id
      });
    }
  }
};
module.exports = {
  resolveChallengeByTaskTypeService,
  updateChallengeProgressByTaskTypeService,
  getUserChallengeOrdersService
};