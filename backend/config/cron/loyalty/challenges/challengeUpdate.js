const {
  Challenge,
} = require("../../../../commonModules/loyalty/challenges/models/Challenge");
const mongoose = require("mongoose");

const HOUR_MS = 60 * 60 * 1000;

// How many hours before expiry to notify
const EXPIRING_WINDOW_HOURS = 24; // adjust as needed

const runLoyaltyChallengeUpdateCron = async () => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_HOURS * HOUR_MS);

  try {
    // ------------------------------------------------
    // 1) Expire challenges whose endDate has passed
    // ------------------------------------------------
    const expireResult = await Challenge.updateMany(
      {
        endDate: { $lt: now },
        status: { $ne: "inactive" },
      },
      {
        $set: { status: "inactive" },
      },
    );

    if (expireResult.modifiedCount > 0) {
      console.log(
        `[CHALLENGE_CRON] Marked ${expireResult.modifiedCount} challenge(s) as expired`,
      );
    }
  } catch (err) {
    console.error("[CHALLENGE_CRON] Failed:", err);
  }
};

module.exports = { runLoyaltyChallengeUpdateCron };
