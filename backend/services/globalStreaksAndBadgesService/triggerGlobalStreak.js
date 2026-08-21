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


    // global streak always runs
    await triggerGlobalStreak(userId);

    if (!payload.category) {
        return;
    }


    switch (payload.category) {

        case "spending":
            return handleSpending(userId, payload.amount);

        case "singlePurchase":
            return handleSinglePurchase(userId, payload.amount);

        case "repeatVisit":
            return handleRepeatVisit(
                userId,
                payload.venueId,
                payload.organizationId
            );

        case "referral":
            return handleReferral(userId, payload.referredUserId);

        default:
            return;
    }
};


/* =====================================================
GLOBAL STREAK
===================================================== */

const triggerGlobalStreak = async (userId) => {


    const now = new Date();

    let user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user) {
        user = await UsersGlobalStreaksProgress.create({ user: userId });
    }

    /* 48h reset */

    if (user.streak.resetAt && now > user.streak.resetAt) {


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
        return;
    }

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics || {}));

    user.streak.current += 1;


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


    await UsersGlobalStreaksLogs.create({
        user: userId,
        action: "increment",
        previousStreak: user.streak.current - 1,
        newStreak: user.streak.current
    });


    await evaluateBadges({
        userId,
        categories: ["streak"],
        previousMetrics,
        newMetrics: user.metrics
    });


};


/* =====================================================
SPENDING BADGES
===================================================== */

const handleSpending = async (userId, amount) => {


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.spending)
        user.metrics.spending = { amount: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.spending.amount += amount;


    await Promise.all([
        user.save(),
        recordUserSpending(userId, amount)
    ]);


    await evaluateBadges({
        userId,
        categories: ["spending"],
        previousMetrics,
        newMetrics: user.metrics
    });


};


/* =====================================================
SINGLE PURCHASE
===================================================== */

const handleSinglePurchase = async (userId, amount) => {


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.singlePurchase)
        user.metrics.singlePurchase = { amount: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.singlePurchase.amount = amount;


    await user.save();


    await evaluateBadges({
        userId,
        categories: ["singlePurchase"],
        previousMetrics,
        newMetrics: user.metrics
    });


};


/* =====================================================
REPEAT VISIT
===================================================== */

const handleRepeatVisit = async (userId, venueId, organizationId) => {


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


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.repeatVisit)
        user.metrics.repeatVisit = { count: 0 };


    const visit = await UserVenueVisits.findOne({
        user: userId,
        venue: venueId
    });


    const previousMetrics = { repeatVisit: { count: visit.visitCount - 1 } };

    const newMetrics = { repeatVisit: { count: visit.visitCount } };

    await user.save();


    await evaluateBadges({
        userId,
        categories: ["repeatVisit"],
        previousMetrics,
        newMetrics
    });


    await handleVenueExplorer(userId);


};


/* =====================================================
VENUE EXPLORER
===================================================== */

const handleVenueExplorer = async (userId) => {


    const venueCount = await UserVenueVisits.countDocuments({
        user: userId
    });


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.venueExplorer)
        user.metrics.venueExplorer = { count: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.venueExplorer.count = venueCount;

    await user.save();


    await evaluateBadges({
        userId,
        categories: ["venueExplorer"],
        previousMetrics,
        newMetrics: user.metrics
    });


};


/* =====================================================
REFERRALS
===================================================== */

const handleReferral = async (userId, referredUserId) => {


    await UserReferrals.updateOne(
        { referrer: userId, referredUser: referredUserId },
        {},
        { upsert: true }
    );


    const referralCount = await UserReferrals.countDocuments({
        referrer: userId
    });


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user.metrics.referral)
        user.metrics.referral = { count: 0 };

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics));

    user.metrics.referral.count = referralCount;

    await user.save();


    await evaluateBadges({
        userId,
        categories: ["referral"],
        previousMetrics,
        newMetrics: user.metrics
    });


};


/* =====================================================
MONTHLY SPENDING LEDGER
===================================================== */

async function recordUserSpending(userId, amount) {


    const now = new Date();

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    await UserMonthlySpend.updateOne(
        { user: userId, year, month },
        { $inc: { totalSpent: amount } },
        { upsert: true }
    );


}


/* =====================================================
TOP SPENDER CRON // runs on the 1st of every month at 00:00
===================================================== */

cron.schedule("0 0 1 * *", async () => {


    const now = new Date();

    const prevMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );

    const year = prevMonth.getUTCFullYear();
    const month = prevMonth.getUTCMonth() + 1;


    /* =========================================
       FIND HIGHEST SPEND VALUE
    ========================================= */

    const topRecord = await UserMonthlySpend
        .findOne({ year, month })
        .sort({ totalSpent: -1 })
        .lean();

    if (!topRecord) {
        return;
    }

    const highestSpend = topRecord.totalSpent;


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
        return;
    }


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


});

const awardTopSpenderBadge = async (userId) => {


    const user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user) {
        return;
    }

    const previousMetrics = JSON.parse(JSON.stringify(user.metrics || {}));

    if (!user.metrics.topSpender)
        user.metrics.topSpender = { rank: 0 };

    user.metrics.topSpender.rank = 1;

    await user.save();


    await evaluateBadges({
        userId,
        categories: ["topSpender"],
        previousMetrics,
        newMetrics: user.metrics
    });

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


    const badges = await BadgeCategories.find({
        category: { $in: categories },
        status: "active"
    }).lean();

    if (!badges.length) {
        return;
    }


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
        return;
    }


    /* =========================================
       UPDATE USER TOTAL POINTS
    ========================================= */

    await UsersGlobalStreaksProgress.updateOne(
        { user: userId },
        { $inc: { totalPointsEarned: totalPoints } }
    );


    /* =========================================
       EXECUTE TRANSACTIONS + NOTIFICATIONS
    ========================================= */

    await Promise.all([
        ...transactions,
        ...notifications
    ]);


};

/* =====================================================
EXPORT
===================================================== */

module.exports = triggerBadgeEngine