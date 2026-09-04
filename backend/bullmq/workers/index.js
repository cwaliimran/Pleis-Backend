// Constructed as a side effect — load only from the worker process (backend/bullmq/index.js).
const activeMenuWorker = require("./activeMenuWorker");
// const anotherWorker = require('./anotherWorker'); // add future workers here

const workers = [
  activeMenuWorker,
  // anotherWorker,
];

module.exports = workers;
