const { runLogCleanup } = require("../../logging/logCleanup");

/**
 * Daily log retention: rotate continuous app/error/pm2 logs, then
 * delete dated files older than LOG_MAX_DAYS (14).
 */
const runLogCleanupCron = async () => {
  const summary = runLogCleanup({ rotate: true });
  console.log("[log-cleanup] cron completed", JSON.stringify(summary));
  return summary;
};

module.exports = { runLogCleanupCron };
