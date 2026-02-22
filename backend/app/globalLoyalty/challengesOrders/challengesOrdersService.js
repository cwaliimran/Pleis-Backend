const challengesRepo =
  require("../challenges/challengesRepository");
const ordersRepo =
  require("./challengesOrdersRepository");

const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { GlobalChallengesOrders } = require("@GlobalChallengesOrdersModel");
/**
 * Resolve global challenge progress
 * (entry point from events / actions)
 */

const resolveGlobalChallengeByTaskTypeService = async ({
  userId,
  taskType,
  value = 1
}) => {

  const now = new Date();
  let remaining = value;
  const updates = [];

  const challenges = await challengesRepo.getActiveGlobalChallenges({ now });

  const eligible = challenges
    .filter(ch => ch.taskType === taskType)
    .sort((a, b) =>
      (a.taskValue ?? 1) - (b.taskValue ?? 1) ||
      new Date(a.createdAt) - new Date(b.createdAt)
    );

  if (!eligible.length) {
    return { success: false, message: "no_active_global_challenge" };
  }

  for (const challenge of eligible) {

    if (remaining <= 0) break;

    const target = challenge.taskValue ?? 1;
    const maxCycles = challenge.claimLimit || Infinity;

    let completedCycles = await ordersRepo.countCompletedGlobalOrders({
      userId,
      challengeId: challenge._id
    });

    while (remaining > 0 && completedCycles < maxCycles) {

      let order =
        await ordersRepo.findActiveGlobalOrder({
          userId,
          challengeId: challenge._id
        });

      const isNewOrder = !order;

      if (!order) {
        order = await ordersRepo.createGlobalChallengeOrder({
          user: userId,
          challenge: challenge._id,
          challengeSnapshot: challenge,
          progress: { current: 0, target },
          status: "in-progress"
        });
      }

      // 🔔 GLOBAL STARTED
      if (isNewOrder) {
        await sendUserNotifications({
          recipientIds: [userId.toString()],
          title: challenge.title,
          body: "Your global challenge has started. Good luck!",
          data: {
            type: NotificationTypes.GLOBAL_CHALLENGE_STARTED,
            objectType: "globalchallengeorders"
          },
          sender: null,
          objectId: order._id
        });
      }

      const capacity = target - order.progress.current;

      if (capacity <= 0) {
        await ordersRepo.markGlobalOrderCompleted(order._id);
        completedCycles++;
        continue;
      }

      const applied = Math.min(remaining, capacity);

      const previousCurrent = order.progress.current;

      order.progress.current += applied;
      remaining -= applied;

      let newStatus = "in-progress";

      if (order.progress.current >= target) {
        newStatus = "completed";
      }

      const updated = await ordersRepo.updateProgressAndStatus(
        order._id,
        order.progress,
        newStatus
      );

      updates.push(updated);

      // =========================
      // 🔥 GLOBAL MILESTONES
      // =========================

      const previousPercentage = Math.floor(
        (previousCurrent / updated.progress.target) * 100
      );

      const currentPercentage = Math.floor(
        (updated.progress.current / updated.progress.target) * 100
      );

      const isCompleted =
        updated.progress.current >= updated.progress.target;

      const milestoneTargets = [50, 80];

      for (const milestone of milestoneTargets) {

        const crossed =
          previousPercentage < milestone &&
          currentPercentage >= milestone;

        // 🚫 Do NOT send milestone if completed in same update
        if (!crossed || isCompleted) continue;

        const milestoneUpdate =
          await GlobalChallengesOrders.findOneAndUpdate(
            {
              _id: updated._id,
              milestonesSent: { $ne: milestone }
            },
            { $addToSet: { milestonesSent: milestone } }
          );

        if (milestoneUpdate) {
          await sendUserNotifications({
            recipientIds: [userId.toString()],
            title: challenge.title,
            body: `You're ${milestone}% done! Keep going.`,
            data: {
              type: NotificationTypes.GLOBAL_CHALLENGE_PROGRESS_MILESTONE,
              objectType: "globalchallengeorders",
              percentage: milestone
            },
            sender: null,
            objectId: updated._id
          });
        }
      }

      // =========================
      // ✅ GLOBAL COMPLETED
      // =========================

      if (newStatus === "completed") {

        // Atomic protection (prevents double completion)
        const locked =
          await GlobalChallengesOrders.findOneAndUpdate(
            {
              _id: updated._id,
              rewardClaimed: { $ne: true }
            },
            {
              status: "completed",
              rewardClaimed: true,
              rewardClaimedAt: new Date()
            },
            { new: true }
          );

        if (locked) {
          await sendUserNotifications({
            recipientIds: [userId.toString()],
            title: challenge.title,
            body: "Congratulations! You completed this global challenge.",
            data: {
              type: NotificationTypes.GLOBAL_CHALLENGE_COMPLETED,
              objectType: "globalchallengeorders"
            },
            sender: null,
            objectId: locked._id
          });
        }

        completedCycles++;
        continue;
      }

      break;
    }
  }

  return {
    success: updates.length > 0,
    updates,
    remaining
  };
};


module.exports = {
  resolveGlobalChallengeByTaskTypeService
};
