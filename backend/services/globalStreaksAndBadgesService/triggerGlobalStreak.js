const UsersGlobalStreaksProgress = require("@UsersGlobalStreaksProgressModel");
const UsersGlobalStreakLogs = require("@UsersGlobalStreaksLogsModel");
const BadgeCategories = require("@BadgeCategoriesModel");
const UserGlobalBadgesModel = require("@UserGlobalBadgesModel");

/*
Example call:

await triggerGlobalStreak(userId, ["streak", "repeatVisit"]);

*/

const triggerGlobalStreak = async (userId, categories = ["streak"]) => {
    const now = new Date();
    console.log(`[triggerGlobalStreak] Triggered for user: ${userId} categories: ${categories}`);

    let user = await UsersGlobalStreaksProgress.findOne({ user: userId });

    if (!user) {
        user = await UsersGlobalStreaksProgress.create({ user: userId });
    }

    /* RESET LOGIC (48h) */

    if (user.streak.resetAt && now > user.streak.resetAt) {

        await UsersGlobalStreakLogs.create({
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

    /* COOLDOWN CHECK */

    if (user.streak.cooldownEndsAt && now < user.streak.cooldownEndsAt) {
        return {
            incremented: false,
            cooldownEndsAt: user.streak.cooldownEndsAt
        };
    }

    const previousStreak = user.streak.current;

    /* INCREMENT */

    user.streak.current += 1;
    user.streak.longest = Math.max(user.streak.longest, user.streak.current);
    user.streak.lastIncrementAt = now;
    user.streak.cooldownEndsAt = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    user.streak.resetAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    if (!user.metrics) user.metrics = {};
    if (!user.metrics.streak) user.metrics.streak = {};

    user.metrics.streak.streakDays = user.streak.current;

    user.totalValidTransactions += 1;

    await user.save();

    await UsersGlobalStreakLogs.create({
        user: userId,
        action: "increment",
        previousStreak,
        newStreak: user.streak.current
    });

    await evaluateBadges({
        userId,
        categories,
        previousStreak,
        newStreak: user.streak.current
    });

    return {
        incremented: true,
        currentStreak: user.streak.current,
        cooldownEndsAt: user.streak.cooldownEndsAt,
        resetAt: user.streak.resetAt
    };
};


/* ================= BADGE EVALUATION ================= */

const evaluateBadges = async ({
    userId,
    categories,
    previousStreak,
    newStreak
}) => {

    console.log(`[evaluateBadges] categories=${categories}`);

    const badges = await BadgeCategories.find({
        category: { $in: categories },
        status: "active"
    });

    if (!badges.length) return;

    const operations = [];

    for (const badge of badges) {

        let previousValue;
        let newValue;

        switch (badge.condition.type) {

            case "streakDays":
                previousValue = previousStreak;
                newValue = newStreak;
                break;

            default:
                continue;
        }

        if (
            badge.condition.value > previousValue &&
            badge.condition.value <= newValue
        ) {

            operations.push({
                badge,
                previousValue,
                newValue
            });
        }
    }

    if (!operations.length) return;

    for (const { badge } of operations) {

        await UserGlobalBadgesModel.updateOne(
            {
                user: userId,
                badgeCategory: badge._id
            },
            {
                $inc: { timesEarned: 1 },
                $set: { lastEarnedAt: new Date() }
            },
            { upsert: true }
        );

        await UsersGlobalStreaksProgress.updateOne(
            { user: userId },
            { $inc: { totalPointsEarned: badge.points } }
        );

        console.log(`[evaluateBadges] Awarded badge ${badge.title}`);
    }
};

module.exports = triggerGlobalStreak;