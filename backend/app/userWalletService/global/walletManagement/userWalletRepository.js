const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const {
  getFirstStatusLevel,
  getNextStatusLevel,
  getPreviousStatusLevel
} = require("../../../../admin/globalLoyalty/statusLevels/statusLevelsRepository");

const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const StatusLevels = require("../../../../admin/globalLoyalty/statusLevels/StatusLevels");
const mongoose = require("mongoose");

// ======================================================================
// CREATE WALLET IF NOT EXISTS
// ======================================================================
const createUserWallet = async (user, session) => {
  if (!user) throw new Error("User is required");

  const userId = typeof user === "string" ? user : (user._id || user.id);
  if (!userId) throw new Error("Invalid user provided");

  // 1️⃣ Find wallet within the session
  let wallet = await UserGlobalWallet.findOne({ user: userId }).session(session);
  if (wallet) return wallet;

  // 2️⃣ Fetch default status level
  let defaultStatus = await getFirstStatusLevel().catch(() => null);

  // 3️⃣ Create wallet inside the session
  const [createdWallet] = await UserGlobalWallet.create(
    [
      {
        user: userId,
        global: {
          points: 0,
          lifetimePoints: 0,
          level: defaultStatus?._id || null,
          lastEvaluated: Date.now(),
        },
      }
    ],
    { session }
  );

  return createdWallet;
};


// ======================================================================
// GET USER WALLET + NEXT LEVEL
// ======================================================================
const getUserWallet = async (user) => {
  if (!user) throw new Error("User is required");
  const userId = typeof user === "string" ? user : (user._id || user.id);

  let wallet = await UserGlobalWallet.findOne({ user: userId }).populate({
    path: "global.level",
    select: "image title type entryPoints retainPoints bonusPointsPerEuro"
  });

  if (!wallet) {
    await createUserWallet(userId);
    return getUserWallet(userId);
  }

  // compute next status level for UI
  let nextStatus = null;
  if (wallet.global?.level?.entryPoints != null) {
    nextStatus = await getNextStatusLevel(wallet.global.level.entryPoints).catch(() => null);
  }

  wallet = wallet.toObject();
  wallet.global.nextStatusLevel = nextStatus || null;

  return wallet;
};

// ======================================================================
// UPDATE GLOBAL POINTS — WALLET ONLY (NO TRANSACTION CREATION HERE)
// ======================================================================
const updateGlobalPoints = async ({
  user,
  points,
  allowNegative = false,
  session
}) => {
  const userId = typeof user === "string" ? user : (user._id || user.id);

  let walletDoc = await UserGlobalWallet.findOne({ user: userId }).session(session);
  if (!walletDoc) walletDoc = await createUserWallet(userId, session);

  const delta = points.total;
  const newBalance = walletDoc.global.points + delta;

  if (!allowNegative && newBalance < 0) {
    return { success: false, message: "Insufficient global points" };
  }

  walletDoc.global.points = newBalance;

  await walletDoc.save({ session });

  return { success: true, newBalance };
};




// ======================================================================
// PROMOTION CHECK USING UNIFIED TRANSACTIONS
// ======================================================================
const checkPromotion = async (userId) => {
  if (!userId) throw new Error("userId required");

  // Earned in last 12 months from unified ledger
  const earned12MonthsAgg = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        walletType: "globalWallet",
        type: "earn",
        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: { _id: null, total: { $sum: "$points.total" } }
    }
  ]);

  const earned12Months = earned12MonthsAgg.length ? earned12MonthsAgg[0].total : 0;

  const wallet = await UserGlobalWallet.findOne({ user: userId }).populate("global.level");
  if (!wallet || !wallet.global.level) return;

  const currentLevel = wallet.global.level;

  // all higher levels
  const higherLevels = await StatusLevels.find({
    entryPoints: { $gt: currentLevel.entryPoints }
  })
    .sort({ entryPoints: 1 })
    .select("title entryPoints retainPoints");

  if (!higherLevels.length) return { promoted: false };

  // highest eligible level
  let selected = null;
  for (const lvl of higherLevels) {
    if (earned12Months >= lvl.entryPoints) {
      selected = lvl;
    }
  }

  if (!selected) return { promoted: false };

  await UserGlobalWallet.updateOne(
    { user: userId },
    {
      $set: {
        "global.level": selected._id,
        "global.lastEvaluated": new Date()
      }
    }
  );

  return { promoted: true, newLevel: selected };
};

// ======================================================================
// DEMOTION CHECK USING UNIFIED TRANSACTIONS
// ======================================================================
const checkDemotion = async (userId) => {
  if (!userId) throw new Error("userId required");

  // Earned in last 12 months
  const earned12MonthsAgg = await UnifiedWalletTransactions.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        walletType: "globalWallet",
        type: "earn",
        createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: { _id: null, total: { $sum: "$points.total" } }
    }
  ]);

  const earned12Months = earned12MonthsAgg.length ? earned12MonthsAgg[0].total : 0;

  const wallet = await UserGlobalWallet.findOne({ user: userId }).populate("global.level");
  const currentLevel = wallet?.global?.level;

  if (!wallet || !currentLevel) return;

  if (earned12Months >= currentLevel.retainPoints) {
    return { demoted: false };
  }

  const fallback = await getPreviousStatusLevel(earned12Months);

  if (!fallback || fallback._id.toString() === currentLevel._id.toString()) {
    return { demoted: false };
  }

  await UserGlobalWallet.updateOne(
    { user: userId },
    {
      $set: {
        "global.level": fallback._id,
        "global.lastEvaluated": new Date()
      }
    }
  );

  return { demoted: true, newLevel: fallback };
};

module.exports = {
  createUserWallet,
  updateGlobalPoints,
  getUserWallet
};
