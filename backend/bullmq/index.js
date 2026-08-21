const workers = require("./workers");

workers.forEach((worker) => {

});

async function shutdown(signal) {
  await Promise.all(workers.map((worker) => worker.close()));

  process.exit(0);
}



module.exports = workers;
