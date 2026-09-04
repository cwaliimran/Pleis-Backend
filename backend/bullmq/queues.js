/**
 * Queue producers — safe to import from the web process.
 * Do not import ../bullmq (workers) from web.
 */
const { Queue } = require("bullmq");
const connection = require("./connection");

const QUEUE_NAMES = {
  ACTIVE_MENU: "active-menu",
};

const activeMenuQueue = new Queue(QUEUE_NAMES.ACTIVE_MENU, {
  connection,
  // Azure Cache for Redis 6.0 uses volatile-lru and cannot be upgraded/reconfigured from the app
  skipVersionCheck: true,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});


activeMenuQueue.on("error", (err) => {
  console.error(`[queue] "${QUEUE_NAMES.ACTIVE_MENU}" error:`, err.message);
});

module.exports = {
  QUEUE_NAMES,
  activeMenuQueue,
};
