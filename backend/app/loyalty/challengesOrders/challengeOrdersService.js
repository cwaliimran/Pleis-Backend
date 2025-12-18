const repo = require("./challengeOrdersRepository");
const { generateMeta } = require("@utils/responseUtil");
const { formatChallenge } = require("./formatters/formatChallenge");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { findBestActiveChallengeByTaskType } = require("../challenges/challengesRepository");
const { Challenge } = require("../../../commonModules/loyalty/challenges/models/Challenge");



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
  // 1️⃣ Find best challenge
  const challenge =
    await findBestActiveChallengeByTaskType({
      companyOrganizer,
      taskType
    });

  if (!challenge) {
    return { success: false, message: "no_active_challenge_found" };
  }

  // 2️⃣ Get or create order (with claim limit enforced)
  let order = await repo.startOrGetChallengeOrder({
    userId,
    challenge
  });

  if (!order) {
    return { success: false, message: "challenge_claim_limit_reached" };
  }

  // 3️⃣ Increment progress
  order = await repo.incrementChallengeProgress({
    userId,
    challengeId: challenge._id,
    value
  });

  if (!order) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  return { success: true, order };
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

  // Format orders
  const formattedOrders = orders.map(order => {
    const formatted = formatChallenge(order);
    return formatted;
  });

  return { orders: formattedOrders, meta };
};



/**
 * Resolve challenge dynamically by taskType
 * - Reuse active order
 * - Otherwise find easiest eligible challenge
 * - Enforce claim limits
 */

//TODO only "referUsers" type implementation in remaining when

const resolveChallengeByTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1,
  items = []
}) => {
  // BUY MENU ITEM → specialized logic (already working)
  if (taskType === "buyMenuItem") {
    return resolveBuyMenuItemChallengeService({
      userId,
      companyOrganizer,
      items
    });
  }

  // ALL OTHER TYPES → simple generic resolver
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

  let appliedAnything = false;

  for (const [menuItemId, incomingQty] of qtyMap.entries()) {
    let remaining = incomingQty;

    console.log("🍔 menuItem:", menuItemId, "incoming:", remaining);

    const challenges = await Challenge.find({
      companyOrganizer,
      taskType: "buyMenuItem",
      taskMenuItem: menuItemId,
      status: "active"
    }).sort({ taskValue: 1, createdAt: 1 });

    for (const challenge of challenges) {
      if (remaining <= 0) break;

      // Resolve target safely
      let target = challenge.taskValue;
      if (!target) {
        const match = challenge.title.match(/\d+/);
        target = match ? Number(match[0]) : 1;
      }

      // Count completed cycles
      let completedCycles = await LoyaltyChallengesOrders.countDocuments({
        user: userId,
        challenge: challenge._id,
        status: "completed"
      });

      const maxCycles = challenge.claimLimit || Infinity;

      while (remaining > 0 && completedCycles < maxCycles) {
        // Reuse or create in-progress cycle
        let order = await LoyaltyChallengesOrders.findOne({
          user: userId,
          challenge: challenge._id,
          status: "in-progress"
        });

        if (!order) {
          order = await LoyaltyChallengesOrders.create({
            user: userId,
            challenge: challenge._id,
            companyOrganizer,
            challengeSnapshot: challenge.toObject(),
            progress: { current: 0, target },
            status: "in-progress"
          });
        }

        const capacity = target - order.progress.current;
        if (capacity <= 0) {
          order.status = "completed";
          order.rewardClaimed = true;
          order.rewardClaimedAt = new Date();
          await order.save();
          completedCycles++;
          continue;
        }

        const applied = Math.min(remaining, capacity);
        order.progress.current += applied;
        remaining -= applied;

        console.log(
          `➡️ ${challenge.title} | applied=${applied} | remaining=${remaining}`
        );

        appliedAnything = true;

        if (order.progress.current >= target) {
          order.status = "completed";
          order.rewardClaimed = true;
          order.rewardClaimedAt = new Date();
          completedCycles++;
          console.log(`✅ COMPLETED: ${challenge.title}`);
        }

        await order.save();
      }
    }
  }

  if (!appliedAnything) {
    return { success: false, message: "menu_item_not_applicable" };
  }

  return { success: true, message: "challenge_progress_updated" };
};


/**
 * Simple resolver for visit / referUsers / earnPoints
 * ✔ Uses existing active order if present
 * ✔ Otherwise starts next eligible challenge
 * ✔ No carry-forward
 * ✔ No overflow logic
 */
const resolveGenericTaskTypeService = async ({
  userId,
  companyOrganizer,
  taskType,
  value = 1
}) => {
  // 1️⃣ Find active in-progress order
  let order = await repo.findActiveOrderByTaskType({
    userId,
    companyOrganizer,
    taskType
  });

  let challenge;

  // 2️⃣ If no active order, find next eligible challenge
  if (!order) {
    const challenges = await repo.findEligibleChallengesByTaskType({
      companyOrganizer,
      taskType
    });

    for (const ch of challenges) {
      const canStart = await repo.canStartNewCycle(userId, ch);
      if (!canStart) continue;

      order = await repo.startOrGetChallengeOrder({
        userId,
        challenge: ch
      });

      challenge = ch;
      break;
    }

    if (!order) {
      return { success: false, message: "no_active_challenge_found" };
    }
  } else {
    challenge = order.challengeSnapshot;
  }

  // 3️⃣ Increment progress (simple add, capped in repo)
  const updated = await repo.incrementChallengeProgress({
    userId,
    challengeId: order.challenge,
    value
  });

  if (!updated) {
    return { success: false, message: "challenge_progress_not_found" };
  }

  // 4️⃣ Complete if target reached
  if (updated.progress.current >= updated.progress.target) {
    await finalizeChallengeCompletion(updated);
  }

  return { success: true, order: updated };
};


const finalizeChallengeCompletion = async (order) => {
  const challenge = order.challengeSnapshot;

  // 1️⃣ Issue reward
  if (challenge.reward.rewardType === "points" && challenge.rewardValue > 0) {
    await createTransaction(
      {
        user: order.user,
        companyOrganizer: challenge.companyOrganizer,
        type: "earn",
        domainType: "loyaltychallengesorders",
        entityId: order._id,
        companyPoints: {
          base: challenge.rewardValue,
          total: challenge.rewardValue
        },
        description: `Challenge reward ${challenge.title}`
      },
      null
    );
  } else {
    await RewardsOrders.create({
      user: order.user,
      sourceType: "loyaltychallengesorders",
      sourceId: order._id,
      snapshot: challenge,
      companyOrganizer: challenge.companyOrganizer
    });
  }

  // 2️⃣ Mark completed
  await LoyaltyChallengesOrders.findByIdAndUpdate(order._id, {
    status: "completed",
    rewardClaimed: true,
    rewardClaimedAt: new Date()
  });

  return { success: true, order, message: "challenge_completed" };
};

module.exports = {
  resolveChallengeByTaskTypeService,
  updateChallengeProgressByTaskTypeService,
  getUserChallengeOrdersService
};
