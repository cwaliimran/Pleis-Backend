const UsersGlobalStreaksProgress = require("@UsersGlobalStreaksProgressModel");
const UsersGlobalStreaksLogs = require("@UsersGlobalStreaksLogsModel");
const BadgeCategories = require("@BadgeCategoriesModel");
const UserGlobalBadgesModel = require("@UserGlobalBadgesModel");

const UserVenueVisits = require("@manageBadgeHistory/UserVenueVisits");
const UserReferrals = require("@manageBadgeHistory/UserReferrals");
const UserMonthlySpend = require("@manageBadgeHistory/UserMonthlySpend");

const cron = require("node-cron");

const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

/* =====================================================
ENTRY POINT
===================================================== */

const triggerBadgeEngine = async (userId, payload = {}) => {

    console.log("[BADGE_ENGINE] Starting triggerBadgeEngine for user:", userId, "payload:", payload);

    // global streak always runs
    await triggerGlobalStreak(userId);

    if (!payload.category) {
        console.log("[BADGE_ENGINE] No category provided, exiting.");
        return;
    }

    console.log("[BADGE_ENGINE] Processing category:", payload.category);

    switch (payload.category) {

        case "spending":
            console.log("[BADGE_ENGINE] Handling spending, amount:", payload.amount);
            return handleSpending(userId, payload.amount);

        case "singlePurchase":
            console.log("[BADGE_ENGINE] Handling singlePurchase, amount:", payload.amount);
            return handleSinglePurchase(userId, payload.amount);

        case "repeatVisit":
            console.log("[BADGE_ENGINE] Handling repeatVisit, venueId:", payload.venueId);
            return handleRepeatVisit(
                userId,
                payload.venueId,
                payload.organizationId
            );

        case "referral":
            console.log("[BADGE_ENGINE] Handling referral, referredUserId:", payload.referredUserId);
            return handleReferral(userId, payload.referredUserId);

        default:
            console.log("[BADGE_ENGINE] Unknown category:", payload.category);
            return;
    }
};


/* =====================================================
GLOBAL STREAK
===================================================== */

const triggerGlobalStreak = async (userId) => {

    console.log("[GLOBAL_STREAK] Starting triggerGlobalStreak for user:", userId);

    const now = new Date();

    let user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user) {
        console.log("[GLOBAL_STREAK] No existing progress found, creating new record.");
        user = await UsersGlobalStreaksProgress.create({ user: userId });
    }

    /* 48h reset */

    if (user.streak.resetAt && now > user.streak.resetAt) {

        console.log("[GLOBAL_STREAK] 48h inactivity detected, resetting streak from", user.streak.current, "to 0.");

        await UsersGlobalStreaksLogs.create({
            user: userId,
            action: "reset",
            previousStreak: user.streak.current,
            newStreak: 0,
            reason: "48h inactivity"
        });

        user.streak.current = 0;
        user.streak.lastResetAt = now;
        user.streak.resetCount += 1;
        user.streak.cooldownEndsAt = null;
    }

    /* cooldown */

    if (user.streak.cooldownEndsAt && now < user.streak.cooldownEndsAt) {
        console.log("[GLOBAL_STREAK] User is in cooldown until:", user.streak.cooldownEndsAt);
        return;
    }

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics || {}));

    user.streak.current += 1;

    console.log("[GLOBAL_STREAK] Incrementing streak to:", user.streak.current);

    user.streak.longest = Math.max(
        user.streak.longest,
        user.streak.current
    );

    user.streak.lastIncrementAt = now;

    user.streak.cooldownEndsAt =
        new Date(now.getTime() + 23 * 60 * 60 * 1000);

    user.streak.resetAt =
        new Date(now.getTime() + 48 * 60 * 60 * 1000);

    if (!user.metrics.streak)
        user.metrics.streak = { streakDays: 0 };

    user.metrics.streak.streakDays = user.streak.current;

    await user.save();

    console.log("[GLOBAL_STREAK] Streak saved. Logging increment.");

    await UsersGlobalStreaksLogs.create({
        user: userId,
        action: "increment",
        previousStreak: user.streak.current - 1,
        newStreak: user.streak.current
    });

    console.log("[GLOBAL_STREAK] Evaluating streak badges.");

    await evaluateBadges({
        userId,
        categories: ["streak"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[GLOBAL_STREAK] Completed for user:", userId);

};


/* =====================================================
SPENDING BADGES
===================================================== */

const handleSpending = async (userId, amount) => {

    console.log("[SPENDING] Starting handleSpending for user:", userId, "amount:", amount);

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.spending)
        user.metrics.spending = { amount: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.spending.amount += amount;

    console.log("[SPENDING] Updated total spending to:", user.metrics.spending.amount);

    await Promise.all([
        user.save(),
        recordUserSpending(userId, amount)
    ]);

    console.log("[SPENDING] Saved. Evaluating spending badges.");

    await evaluateBadges({
        userId,
        categories: ["spending"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[SPENDING] Completed for user:", userId);

};


/* =====================================================
SINGLE PURCHASE
===================================================== */

const handleSinglePurchase = async (userId, amount) => {

    console.log("[SINGLE_PURCHASE] Starting handleSinglePurchase for user:", userId, "amount:", amount);

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.singlePurchase)
        user.metrics.singlePurchase = { amount: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.singlePurchase.amount = amount;

    console.log("[SINGLE_PURCHASE] Set singlePurchase amount to:", amount);

    await user.save();

    console.log("[SINGLE_PURCHASE] Saved. Evaluating singlePurchase badges.");

    await evaluateBadges({
        userId,
        categories: ["singlePurchase"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[SINGLE_PURCHASE] Completed for user:", userId);

};


/* =====================================================
REPEAT VISIT
===================================================== */

const handleRepeatVisit = async (userId, venueId, organizationId) => {

    console.log("[REPEAT_VISIT] Starting handleRepeatVisit for user:", userId, "venueId:", venueId);

    await UserVenueVisits.updateOne(
        { user: userId, venue: venueId },
        {
            $inc: { visitCount: 1 },
            $set: {
                organization: organizationId,
                lastVisitAt: new Date()
            }
        },
        { upsert: true }
    );

    console.log("[REPEAT_VISIT] Updated venue visit record.");

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.repeatVisit)
        user.metrics.repeatVisit = { count: 0 };


    const visit = await UserVenueVisits.findOne({
        user: userId,
        venue: venueId
    });

    console.log("[REPEAT_VISIT] Visit count for this venue:", visit.visitCount);

    const previousMetrics = { repeatVisit: { count: visit.visitCount - 1 } };

    const newMetrics = { repeatVisit: { count: visit.visitCount } };

    await user.save();

    console.log("[REPEAT_VISIT] Evaluating repeatVisit badges.");

    await evaluateBadges({
        userId,
        categories: ["repeatVisit"],
        previousMetrics,
        newMetrics
    });

    console.log("[REPEAT_VISIT] Proceeding to venueExplorer check.");

    await handleVenueExplorer(userId);

    console.log("[REPEAT_VISIT] Completed for user:", userId);

};


/* =====================================================
VENUE EXPLORER
===================================================== */

const handleVenueExplorer = async (userId) => {

    console.log("[VENUE_EXPLORER] Starting handleVenueExplorer for user:", userId);

    const venueCount = await UserVenueVisits.countDocuments({
        user: userId
    });

    console.log("[VENUE_EXPLORER] Total unique venues visited:", venueCount);

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.venueExplorer)
        user.metrics.venueExplorer = { count: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.venueExplorer.count = venueCount;

    await user.save();

    console.log("[VENUE_EXPLORER] Evaluating venueExplorer badges.");

    await evaluateBadges({
        userId,
        categories: ["venueExplorer"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[VENUE_EXPLORER] Completed for user:", userId);

};


/* =====================================================
REFERRALS
===================================================== */

const handleReferral = async (userId, referredUserId) => {

    console.log("[REFERRAL] Starting handleReferral for user:", userId, "referredUserId:", referredUserId);

    await UserReferrals.updateOne(
        { referrer: userId, referredUser: referredUserId },
        {},
        { upsert: true }
    );

    console.log("[REFERRAL] Referral record upserted.");

    const referralCount = await UserReferrals.countDocuments({
        referrer: userId
    });

    console.log("[REFERRAL] Total referral count:", referralCount);

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.referral)
        user.metrics.referral = { count: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.referral.count = referralCount;

    await user.save();

    console.log("[REFERRAL] Evaluating referral badges.");

    await evaluateBadges({
        userId,
        categories: ["referral"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[REFERRAL] Completed for user:", userId);

};


/* =====================================================
MONTHLY SPENDING LEDGER
===================================================== */

async function recordUserSpending(userId, amount) {

    console.log("[MONTHLY_SPEND] Recording spending for user:", userId, "amount:", amount);

    const now = new Date();

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    await UserMonthlySpend.updateOne(
        { user: userId, year, month },
        { $inc: { totalSpent: amount } },
        { upsert: true }
    );

    console.log("[MONTHLY_SPEND] Recorded for year:", year, "month:", month);

}


/* =====================================================
TOP SPENDER CRON // runs on the 1st of every month at 00:00
===================================================== */

cron.schedule("0 0 1 * *", async () => {

    console.log("[TOP_SPENDER_CRON] Running monthly top spender cron job.");

    const now = new Date();

    const prevMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );

    const year = prevMonth.getUTCFullYear();
    const month = prevMonth.getUTCMonth() + 1;

    console.log("[TOP_SPENDER_CRON] Evaluating for year:", year, "month:", month);

    /* =========================================
       FIND HIGHEST SPEND VALUE
    ========================================= */

    const topRecord = await UserMonthlySpend
        .findOne({ year, month })
        .sort({ totalSpent: -1 })
        .lean();

    if (!topRecord) {
        console.log("[TOP_SPENDER_CRON] No spending records found for this month.");
        return;
    }

    const highestSpend = topRecord.totalSpent;

    console.log("[TOP_SPENDER_CRON] Highest spend value:", highestSpend);

    /* =========================================
       FIND ALL USERS WITH SAME SPEND
    ========================================= */

    const topUsers = await UserMonthlySpend
        .find({
            year,
            month,
            totalSpent: highestSpend
        })
        .select("user")
        .lean();

    if (!topUsers.length) {
        console.log("[TOP_SPENDER_CRON] No top users found.");
        return;
    }

    console.log("[TOP_SPENDER_CRON] Found", topUsers.length, "top spender(s).");

    /* =========================================
       AWARD BADGES
    ========================================= */

    const jobs = [];

    for (const record of topUsers) {
        jobs.push(
            awardTopSpenderBadge(record.user)
        );
    }

    await Promise.all(jobs);

    console.log("[TOP_SPENDER_CRON] Completed awarding top spender badges.");

});

const awardTopSpenderBadge = async (userId) => {

    console.log("[TOP_SPENDER] Awarding top spender badge to user:", userId);

    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user) {
        console.log("[TOP_SPENDER] User not found, skipping.");
        return;
    }

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics || {}));

    if (!user.metrics.topSpender)
        user.metrics.topSpender = { rank: 0 };

    user.metrics.topSpender.rank = 1;

    await user.save();

    console.log("[TOP_SPENDER] Evaluating topSpender badges.");

    await evaluateBadges({
        userId,
        categories: ["topSpender"],
        previousMetrics,
        newMetrics: user.metrics
    });

    console.log("[TOP_SPENDER] Completed for user:", userId);
};


/* =====================================================
BADGE EVALUATION ENGINE
===================================================== */

const evaluateBadges = async ({
    userId,
    categories,
    previousMetrics,
    newMetrics,
}) => {

    console.log("[EVALUATE_BADGES] Starting evaluation for user:", userId, "categories:", categories);

    const badges = await BadgeCategories.find({
        category: { $in: categories },
        status: "active"
    }).lean();

    if (!badges.length) {
        console.log("[EVALUATE_BADGES] No active badges found for categories:", categories);
        return;
    }

    console.log("[EVALUATE_BADGES] Found", badges.length, "badge(s) to evaluate.");

    let totalPoints = 0;

    const { createTransactionService } =
        require("../../app/userWalletService/transactions/services/unifiedTransactionsService");


    const transactions = [];
    const notifications = [];

    for (const badge of badges) {

        const category = badge.category;
        const type = badge.condition.type;
        const threshold = badge.condition.value;

        const previousValue =
            previousMetrics?.[category]?.[type] || 0;

        const newValue =
            newMetrics?.[category]?.[type] || 0;

        if (
            threshold > previousValue &&
            threshold <= newValue
        ) {

            console.log("[EVALUATE_BADGES] Badge unlocked:", badge.title, "| threshold:", threshold, "| previousValue:", previousValue, "| newValue:", newValue);

            /* =========================================
               SAVE / UPDATE USER BADGE
            ========================================= */

            const badgeRecord = await UserGlobalBadgesModel.findOneAndUpdate(
                { user: userId, badgeCategory: badge._id },
                {
                    $inc: { timesEarned: 1 },
                    $set: { lastEarnedAt: new Date() }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

            totalPoints += badge.points;

            /* =========================================
               CREATE POINTS TRANSACTION
            ========================================= */

            const globalPoints = {
                base: badge.points,
                multiplier: 1,
                total: badge.points,
                pointsPerEuro: null
            };

            transactions.push(
                createTransactionService(
                    {
                        user: userId,
                        globalPoints,
                        allowNegative: false,
                        type: "earn",
                        description: `Badge earned: ${badge.title}`,
                        entityId: badgeRecord._id,
                        domainType: "userglobalbadges"
                    },
                    null
                )
            );

            /* =========================================
               SEND NOTIFICATION
            ========================================= */

            notifications.push(
                sendUserNotifications({
                    recipientIds: [userId.toString()],
                    title: "New Badge Earned 🎉",
                    body: `Congratulations! You earned the "${badge.title}" badge.`,
                    data: {
                        type: NotificationTypes.GLOBAL_BADGE_EARNED,
                        badgeId: badgeRecord._id,
                        objectType: "userglobalbadges"
                    },
                    sender: userId,
                    objectId: badgeRecord._id,
                    image: badge.icon || null
                })
            );

        }
    }

    if (!transactions.length) {
        console.log("[EVALUATE_BADGES] No new badges earned.");
        return;
    }

    console.log("[EVALUATE_BADGES] Total points to award:", totalPoints);

    /* =========================================
       UPDATE USER TOTAL POINTS
    ========================================= */

    await UsersGlobalStreaksProgress.updateOne(
        { user: userId },
        { $inc: { totalPointsEarned: totalPoints } }
    );

    console.log("[EVALUATE_BADGES] Updated user total points. Executing transactions and notifications.");

    /* =========================================
       EXECUTE TRANSACTIONS + NOTIFICATIONS
    ========================================= */

    await Promise.all([
        ...transactions,
        ...notifications
    ]);

    console.log("[EVALUATE_BADGES] Completed badge evaluation for user:", userId);

};

/* =====================================================
EXPORT
===================================================== */

module.exports = triggerBadgeEngine