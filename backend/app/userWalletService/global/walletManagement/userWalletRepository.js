const { UserGlobalWallet } = require("@UserGlobalWalletModel");
const { getFirstStatusLevel, getNextStatusLevel, getPreviousStatusLevelByRetainPoints, getPreviousStatusLevel } = require("../../../../admin/globalLoyalty/statusLevels/statusLevelsRepository");
const { GlobalWalletTransactions } = require("@GlobalWalletTransactionsModel");
const StatusLevels = require("../../../../admin/globalLoyalty/statusLevels/StatusLevels");
const { default: mongoose } = require("mongoose");

const createUserWallet = async (user) => {
    if (!user) throw new Error("User is required");

    const userId = typeof user === "string" ? user : (user._id || user.id);
    if (!userId) throw new Error("Invalid user provided");

    let wallet = await UserGlobalWallet.findOne({ user: userId });
    if (wallet) return wallet;

    let defaultStatus = null;
    try {
        defaultStatus = await getFirstStatusLevel();
    } catch (err) {
        defaultStatus = null;
    }

    const walletData = {
        user: userId,
        global: {
            points: 0,
            lifetimePoints: 0,
            level: defaultStatus?._id || null,
            lastEvaluated: Date.now()
        }
    };

    wallet = await UserGlobalWallet.create(walletData);
    return wallet;
};

const getUserWallet = async (user) => {
    if (!user) throw new Error("User is required");
    checkDemotion(user);

    const userId = typeof user === "string" ? user : (user._id || user.id);
    if (!userId) throw new Error("Invalid user provided");

    let wallet = await UserGlobalWallet.findOne({ user: userId }).populate({
        path: "global.level",
        select: "image title type entryPoints retainPoints bonusPointsPerEuro",
    });

    let nextStatus = null;
    if (wallet && wallet.global && wallet.global.level) {
        try {
            const currentStatusDoc = wallet.global.level;
            if (currentStatusDoc && currentStatusDoc.entryPoints != null) {
                nextStatus = await getNextStatusLevel(currentStatusDoc.entryPoints);
            }
        } catch (err) {
            nextStatus = null;
        }
    }
    if (nextStatus) {
        wallet = wallet.toObject();
        wallet.global.nextStatusLevel = nextStatus;
    }

    if (wallet) return wallet;

    let defaultStatus = null;
    try {
        defaultStatus = await getFirstStatusLevel();
    } catch (err) {
        defaultStatus = null;
    }

    const walletData = {
        user: userId,
        global: {
            points: 0,
            lifetimePoints: 0,
            level: defaultStatus?._id || null,
            lastEvaluated: Date.now()
        }
    };

    wallet = await UserGlobalWallet.create(walletData);
    let updatedWallet = await getUserWallet(userId);
    return updatedWallet;
};

const updateGlobalPoints = async ({ user, pointsDelta = 0, allowNegative = false, objectId, objectType }) => {
    if (!user) throw new Error("User is required");

    const userId = typeof user === "string" ? user : (user._id || user.id);

    // 1. Fetch or create wallet
    let walletDoc = await UserGlobalWallet.findOne({ user: userId });
    if (!walletDoc) walletDoc = await createUserWallet(userId);

    // 2. Calculate new balance
    const newBalance = walletDoc.global.points + pointsDelta;

    if (!allowNegative && newBalance < 0) {
        throw new Error("Insufficient global points");
    }

    // 3. Update balance + lifetime analytics
    walletDoc.global.points = newBalance;
    if (pointsDelta > 0) {
        walletDoc.global.lifetimePoints += pointsDelta;
    }

    await walletDoc.save();

    // 4. WRITE TRANSACTION (this was missing!)
    await GlobalWalletTransactions.create({
        user: userId,
        type: pointsDelta >= 0 ? "earn" : "adjustment",
        source: "system",
        points: {
            base: pointsDelta,
            multiplier: 1,
            total: pointsDelta
        },
        closingBalance: newBalance,
        description: "System points update",
        objectId,
        objectType
    });

    // 5. INSTANT PROMOTION CHECK
    await checkPromotion(userId);

    // 6. Return updated wallet view
    const walletView = await getUserWallet(userId);

    return {
        success: true,
        pointsDelta,
        newBalance,
        wallet: walletView
    };
};

const checkPromotion = async (userId) => {
    if (!userId) throw new Error("userId required");

    // 1. Earned points in last 12 months
    const agg = await GlobalWalletTransactions.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                type: "earn",
                createdAt: {
                    $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
                }
            }
        },
        { $group: { _id: null, total: { $sum: "$points.total" } } }
    ]);

    const earned12Months = agg?.length ? agg[0].total : 0;

    // 2. Wallet + current level
    const wallet = await UserGlobalWallet.findOne({ user: userId }).populate("global.level");
    if (!wallet || !wallet.global.level) return;

    const currentLevel = wallet.global.level;

    // 3. Get ALL higher levels
    const higherLevels = await StatusLevels.find({
        entryPoints: { $gt: currentLevel.entryPoints }
    })
        .sort({ entryPoints: 1 }) // ascending
        .select("title entryPoints retainPoints");

    if (!higherLevels.length) return { promoted: false };

    // 4. Determine highest eligible level based on earned points
    let selectedLevel = null;

    for (const lvl of higherLevels) {
        if (earned12Months >= lvl.entryPoints) {
            selectedLevel = lvl; // keep upgrading until last eligible
        }
    }

    // No eligible higher level
    if (!selectedLevel) return { promoted: false };

    // 5. Update wallet with highest eligible level
    await UserGlobalWallet.updateOne(
        { user: userId },
        {
            $set: {
                "global.level": selectedLevel._id,
                "global.lastEvaluated": new Date()
            }
        }
    );

    return { promoted: true, newLevel: selectedLevel };
};



const checkDemotion = async (userId) => {
    // 1. Earned last 12 months
    const agg = await GlobalWalletTransactions.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                type: "earn",
                createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
            }
        },
        { $group: { _id: null, total: { $sum: "$points.total" } } }
    ]);

    const earned12Months = agg.length ? agg[0].total : 0;

    // 2. Wallet + current level
    const wallet = await UserGlobalWallet.findOne({ user: userId }).populate("global.level");
    const currentLevel = wallet?.global?.level || null;

    if (!wallet || !currentLevel) return;
    // 3. If user didn't meet retainPoints → find correct fallback level
    if (earned12Months < currentLevel?.retainPoints) {
        const fallback = await getPreviousStatusLevel(earned12Months);

        if (fallback && fallback._id.toString() !== currentLevel._id.toString()) {
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
        }
    }

    return { demoted: false };
};



module.exports = {
    createUserWallet,
    updateGlobalPoints,
    getUserWallet
};
