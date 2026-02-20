const challengesRepo =
  require("../challenges/challengesRepository");
const ordersRepo =
  require("./challengesOrdersRepository");

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

  // 1️⃣ Fetch eligible global challenges (ordered: easiest first)
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

  // 2️⃣ Iterate challenges
  for (const challenge of eligible) {
    if (remaining <= 0) break;

    const target = challenge.taskValue ?? 1;
    const maxCycles = challenge.claimLimit || Infinity;

    // Count completed cycles
    let completedCycles = await ordersRepo.countCompletedGlobalOrders({
      userId,
      challengeId: challenge._id
    });

    // 3️⃣ Apply value across cycles
    while (remaining > 0 && completedCycles < maxCycles) {
      // Get or create active order
      let order =
        await ordersRepo.findActiveGlobalOrder({
          userId,
          challengeId: challenge._id
        });

      if (!order) {
        order = await ordersRepo.createGlobalChallengeOrder({
          user: userId,
          challenge: challenge._id,
          challengeSnapshot: challenge,
          progress: { current: 0, target },
          status: "in-progress"
        });
      }

      const capacity = target - order.progress.current;

      if (capacity <= 0) {
        // edge safety
        order.status = "completed";
        await ordersRepo.markGlobalOrderCompleted(order._id);
        completedCycles++;
        continue;
      }

      const applied = Math.min(remaining, capacity);

      order.progress.current += applied;
      remaining -= applied;

      let newStatus = "in-progress";

      if (order.progress.current >= target) {
        newStatus = "completed";
        completedCycles++;
      }

      await ordersRepo.updateProgressAndStatus(
        order._id,
        order.progress,
        newStatus
      );

      updates.push({
        challengeId: challenge._id,
        applied,
        status: newStatus
      });

      // If completed, loop may start next cycle or move to next challenge
      if (newStatus === "completed") continue;
      else break;
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
