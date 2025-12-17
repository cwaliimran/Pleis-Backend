const challengesRepo =
  require("../challenges/challengesRepository");
const ordersRepo =
  require("./challengesOrdersRepository");

/**
 * Resolve global challenge progress
 * (entry point from events / actions)
 */
const resolveGlobalChallengeByTaskType = async ({
  userId,
  taskType,
  value = 1
}) => {
  const now = new Date();
  console.log(`[challengesOrdersService] Resolving global challenge for userId=${userId}, taskType=${taskType}, value=${value}`);

  const challenges =
    await challengesRepo.getActiveGlobalChallenges({ now });
  console.log(`[challengesOrdersService] Found ${challenges.length} active global challenges`);

  let remaining = value;
  const updates = [];

  for (const ch of challenges) {
    if (ch.taskType !== taskType) continue;
    if (remaining <= 0) break;

    const target = ch.taskValue ?? 1;
    console.log(`[challengesOrdersService] Processing challenge ${ch._id} (target=${target})`);

    // Find active order
    let order =
      await ordersRepo.getActiveGlobalOrdersForDashboard({ userId })
        .then(list =>
          list.find(o =>
            String(o.challengeSnapshot?._id || o.challenge) ===
            String(ch._id)
          )
        );

    if (!order) {
      console.log(`[challengesOrdersService] No active order found for challenge ${ch._id}, creating new order`);
      order = await ordersRepo.createGlobalChallengeOrder({
        user: userId,
        challenge: ch._id,
        challengeSnapshot: ch,
        progress: { current: 0, target },
        status: "in-progress"
      });
    } else {
      console.log(`[challengesOrdersService] Found active order ${order._id} for challenge ${ch._id}`);
    }

    const canApply = Math.min(
      remaining,
      target - order.progress.current
    );
    console.log(`[challengesOrdersService] Can apply ${canApply} to challenge ${ch._id}`);

    if (canApply <= 0) continue;

    order.progress.current += canApply;
    remaining -= canApply;

    if (order.progress.current >= target) {
      order.status = "completed";
      console.log(`[challengesOrdersService] Challenge ${ch._id} completed for user ${userId}`);
    }

    let newStatus = order.status;

    if (order.progress.current >= target) {
      newStatus = "completed";
      console.log(
        `[challengesOrdersService] Challenge ${ch._id} completed for user ${userId}`
      );
    }

    await ordersRepo.updateProgressAndStatus(
      order._id,
      order.progress,
      newStatus
    );

    order.status = newStatus; // keep in-memory state consistent


    updates.push({
      challengeId: ch._id,
      applied: canApply,
      completed: newStatus
    });
  }

  console.log(`[challengesOrdersService] resolveGlobalChallengeByTaskType result:`, { success: updates.length > 0, updates, remaining });

  return {
    success: updates.length > 0,
    updates,
    remaining
  };
};

module.exports = {
  resolveGlobalChallengeByTaskType
};
