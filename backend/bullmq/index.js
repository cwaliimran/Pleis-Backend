/**
 * BullMQ workers — worker process only.
 * Web must import ./queues.js to enqueue jobs (never this file).
 */
if (process.env.PROCESS_ROLE === "web") {
  throw new Error(
    "BullMQ workers must not be loaded in the web process. Import backend/bullmq/queues.js to enqueue jobs.",
  );
}

const workers = require("./workers");

async function closeWorkers() {
  await Promise.all(workers.map((worker) => worker.close()));
}

module.exports = { workers, closeWorkers };
