const { Queue } = require("bullmq");
const connection = require("./connection");

const QUEUE_NAMES = {
  ACTIVE_MENU: "active-menu",
};

const activeMenuQueue = new Queue(QUEUE_NAMES.ACTIVE_MENU, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

console.log(`[queue] "${QUEUE_NAMES.ACTIVE_MENU}" queue initialized`);

activeMenuQueue.on("error", (err) => {
  console.error(`[queue] "${QUEUE_NAMES.ACTIVE_MENU}" error:`, err.message);
});

module.exports = {
  QUEUE_NAMES,
  activeMenuQueue,
};
