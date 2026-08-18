const workers = require("./workers");

console.log(`[bullmq] starting ${workers.length} worker(s)...`);
workers.forEach((worker) => {
  console.log(`[bullmq] worker "${worker.name}" is running`);
});

async function shutdown(signal) {
  await Promise.all(workers.map((worker) => worker.close()));
  console.log("[bullmq] all workers closed. bye.");
  process.exit(0);
}



module.exports = workers;
