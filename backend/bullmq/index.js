/**
 * BullMQ entry: producers live in ./queues (safe for API role).
 * Consumers start only via startWorkers() (worker / all role).
 */

const queues = require("./queues");

let workers = null;

function startWorkers() {
  if (workers) return workers;
  workers = require("./workers");
  return workers;
}

async function closeWorkers() {
  if (!workers || !workers.length) return;
  await Promise.all(workers.map((worker) => worker.close()));
  workers = null;
}

function getWorkers() {
  return workers;
}

module.exports = {
  ...queues,
  startWorkers,
  closeWorkers,
  getWorkers,
};
