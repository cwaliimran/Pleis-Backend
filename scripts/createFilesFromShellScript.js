/**
 * generate-global-loyalty-challenge-orders.js
 *
 * Run:
 * node generate-global-loyalty-challenge-orders.js
 */

const fs = require("fs");
const path = require("path");

const BASE_PATH =
  "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/globalLoyalty/challengesOrders";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content.trim() + "\n");
  console.log("✅ created:", filePath);
}

/* ============================
   Ensure folder
============================ */
ensureDir(BASE_PATH);

/* ============================
   challengesOrdersRepository.js
============================ */
writeFile(
  path.join(BASE_PATH, "challengesOrdersRepository.js"),
  `
const GlobalChallengeOrder = require("../models/GlobalChallengeOrder");

/**
 * Active challenge orders for dashboard
 */
const getActiveGlobalOrdersForDashboard = async ({ userId }) => {
  return GlobalChallengeOrder.find({
    user: userId,
    status: "in-progress"
  }).lean();
};

/**
 * Create new challenge order
 */
const createGlobalChallengeOrder = async (payload) => {
  return GlobalChallengeOrder.create(payload);
};

/**
 * Update progress
 */
const updateProgress = async (orderId, progress) => {
  return GlobalChallengeOrder.findByIdAndUpdate(
    orderId,
    { progress },
    { new: true }
  );
};

module.exports = {
  getActiveGlobalOrdersForDashboard,
  createGlobalChallengeOrder,
  updateProgress
};
`
);

/* ============================
   challengesOrdersService.js
============================ */
writeFile(
  path.join(BASE_PATH, "challengesOrdersService.js"),
  `
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

  const challenges =
    await challengesRepo.getActiveGlobalChallenges({ now });

  let remaining = value;
  const updates = [];

  for (const ch of challenges) {
    if (ch.taskType !== taskType) continue;
    if (remaining <= 0) break;

    const target = ch.taskValue ?? 1;

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
      order = await ordersRepo.createGlobalChallengeOrder({
        user: userId,
        challenge: ch._id,
        challengeSnapshot: ch,
        progress: { current: 0, target },
        status: "in-progress"
      });
    }

    const canApply = Math.min(
      remaining,
      target - order.progress.current
    );

    if (canApply <= 0) continue;

    order.progress.current += canApply;
    remaining -= canApply;

    if (order.progress.current >= target) {
      order.status = "completed";
    }

    await ordersRepo.updateProgress(order._id, order.progress);

    updates.push({
      challengeId: ch._id,
      applied: canApply,
      completed: order.status === "completed"
    });
  }

  return {
    success: updates.length > 0,
    updates,
    remaining
  };
};

module.exports = {
  resolveGlobalChallengeByTaskType
};
`
);

/* ============================
   challengesOrdersController.js
============================ */
writeFile(
  path.join(BASE_PATH, "challengesOrdersController.js"),
  `
const {
  sendResponse,
  getReadableErrorMessage
} = require("../../helperUtils/responseUtil");

const service = require("./challengesOrdersService");

/**
 * Internal endpoint
 * (called from events, actions, cron, etc.)
 */
const resolveGlobalChallenge = async (req, res) => {
  try {
    const userId = req.user._id;
    const { taskType, value } = req.body;

    const result =
      await service.resolveGlobalChallengeByTaskType({
        userId,
        taskType,
        value
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_challenge_progress_updated",
      data: result
    });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: err.message,
      error
    });
  }
};

module.exports = {
  resolveGlobalChallenge
};
`
);

/* ============================
   challengesOrdersRoutes.js
============================ */
writeFile(
  path.join(BASE_PATH, "challengesOrdersRoutes.js"),
  `
const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const {
  resolveGlobalChallenge
} = require("./challengesOrdersController");

const router = express.Router();

router.use(auth);

/**
 * POST /global-loyalty/challenges-orders/resolve
 */
router.post("/resolve", resolveGlobalChallenge);

module.exports = router;
`
);

console.log("\\n🚀 Global Loyalty Challenge Orders module generated successfully.");
