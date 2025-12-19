const fs = require("fs");
const path = require("path");

/* ============================
   BASE PATHS
============================ */
const BASE =
  "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/globalLoyalty";

const rewardsPath = path.join(BASE, "rewards");
const ordersPath = path.join(BASE, "rewardsOrders");
const modelsPath = path.join(ordersPath, "models");

/* ============================
   HELPERS
============================ */
const ensureDir = dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const write = (file, content) => {
  fs.writeFileSync(file, content.trim() + "\n", "utf8");
  console.log("✔", file);
};

/* ============================
   DIRECTORIES
============================ */
[rewardsPath, ordersPath, modelsPath].forEach(ensureDir);

/* ============================================================
   rewardsOrders/models/GlobalRewardsOrders.js
============================================================ */
write(
  path.join(modelsPath, "GlobalRewardsOrders.js"),
`
const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  sourceType: { type: String, default: "globalRewards" },
  sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "GlobalReward", index: true },
  rewardSnapshot: { type: Object, required: true },
  status: { type: String, enum: ["claimed","redeemed","expired"], default: "claimed" }
}, { timestamps: true });

module.exports =
  mongoose.models.GlobalRewardsOrders ||
  mongoose.model("GlobalRewardsOrders", schema);
`
);

/* ============================================================
   rewardsOrders/rewardsOrdersRepository.js
============================================================ */
write(
  path.join(ordersPath, "rewardsOrdersRepository.js"),
`
const mongoose = require("mongoose");
const GlobalRewardsOrders = require("./models/GlobalRewardsOrders");

const getClaimCounts = async (userId, rewardIds) => {
  const rows = await GlobalRewardsOrders.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), sourceId: { $in: rewardIds } } },
    { $group: { _id: "$sourceId", total: { $sum: 1 } } }
  ]);
  return new Map(rows.map(r => [String(r._id), r.total]));
};

const createOrder = async ({ userId, reward }) =>
  GlobalRewardsOrders.create({
    user: userId,
    sourceId: reward._id,
    rewardSnapshot: reward
  });

const getOrders = async ({ userId, skip, limit }) =>
  GlobalRewardsOrders.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

const countOrders = async userId =>
  GlobalRewardsOrders.countDocuments({ user: userId });

module.exports = { getClaimCounts, createOrder, getOrders, countOrders };
`
);

/* ============================================================
   rewardsOrders/rewardsOrdersService.js
============================================================ */
write(
  path.join(ordersPath, "rewardsOrdersService.js"),
`
const GlobalReward = require("@GlobalLoyaltyReward");
const repo = require("./rewardsOrdersRepository");

const claim = async ({ userId, rewardId }) => {
  const reward = await GlobalReward.findById(rewardId).lean();
  if (!reward || reward.status !== "active") throw new Error("reward_not_available");

  const counts = await repo.getClaimCounts(userId, [reward._id]);
  const claimed = counts.get(String(reward._id)) || 0;

  if (reward.claimLimit && claimed >= reward.claimLimit)
    throw new Error("claim_limit_reached");

  return repo.createOrder({ userId, reward });
};

const listOrders = async ({ userId, page, limit }) => {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    repo.getOrders({ userId, skip, limit }),
    repo.countOrders(userId)
  ]);
  return { data, total };
};

module.exports = { claim, listOrders };
`
);

/* ============================================================
   rewardsOrders/rewardsOrdersController.js
============================================================ */
write(
  path.join(ordersPath, "rewardsOrdersController.js"),
`
const { sendResponse, parsePaginationParams, getReadableErrorMessage } =
  require("@utils/responseUtil");
const service = require("./rewardsOrdersService");

exports.claim = async (req, res) => {
  try {
    const data = await service.claim({ userId: req.user._id, rewardId: req.body.id });
    sendResponse({ res, statusCode: 201, data });
  } catch (e) {
    const r = getReadableErrorMessage(e);
    sendResponse({ res, statusCode: 400, translationKey: r.message });
  }
};

exports.getOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { data, total } = await service.listOrders({
    userId: req.user._id, page, limit
  });
  sendResponse({ res, statusCode: 200, data, meta: { total } });
};
`
);

/* ============================================================
   rewardsOrders/rewardsOrdersRoutes.js
============================================================ */
write(
  path.join(ordersPath, "rewardsOrdersRoutes.js"),
`
const router = require("express").Router();
const auth = require("../../../middlewares/authMiddleware");
const c = require("./rewardsOrdersController");

router.use(auth);
router.post("/claim", c.claim);
router.get("/", c.getOrders);

module.exports = router;
`
);

write(path.join(ordersPath, "index.js"), `module.exports = require("./rewardsOrdersRoutes");`);

/* ============================================================
   rewards/rewardsRepository.js
============================================================ */
write(
  path.join(rewardsPath, "rewardsRepository.js"),
`
const GlobalReward = require("@GlobalLoyaltyReward");

exports.get = (q, s, l) =>
  GlobalReward.find(q).sort({ createdAt: -1 }).skip(s).limit(l).lean();

exports.count = q => GlobalReward.countDocuments(q);
`
);

/* ============================================================
   rewards/rewardsService.js
============================================================ */
write(
  path.join(rewardsPath, "rewardsService.js"),
`
const repo = require("./rewardsRepository");
const { getClaimCounts } = require("../rewardsOrders/rewardsOrdersRepository");

exports.get = async ({ userId, page, limit }) => {
  const skip = (page - 1) * limit;
  const rewards = await repo.get({ status: "active" }, skip, limit);
  const total = await repo.count({ status: "active" });

  const counts = await getClaimCounts(
    userId,
    rewards.map(r => r._id)
  );

  const data = rewards.map(r => {
    const claimed = counts.get(String(r._id)) || 0;
    return {
      ...r,
      claimed,
      canClaim: !r.claimLimit || claimed < r.claimLimit
    };
  });

  return { data, total };
};
`
);

/* ============================================================
   rewards/rewardsController.js
============================================================ */
write(
  path.join(rewardsPath, "rewardsController.js"),
`
const { sendResponse, parsePaginationParams } = require("@utils/responseUtil");
const service = require("./rewardsService");

exports.get = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { data, total } = await service.get({
    userId: req.user._id, page, limit
  });
  sendResponse({ res, statusCode: 200, data, meta: { total } });
};
`
);

/* ============================================================
   rewards/rewardsRoutes.js
============================================================ */
write(
  path.join(rewardsPath, "rewardsRoutes.js"),
`
const router = require("express").Router();
const auth = require("../../../middlewares/authMiddleware");
const c = require("./rewardsController");

router.use(auth);
router.get("/", c.get);

module.exports = router;
`
);

write(path.join(rewardsPath, "index.js"), `module.exports = require("./rewardsRoutes");`);

console.log("\\n✅ Global Rewards & Orders fully created.");
