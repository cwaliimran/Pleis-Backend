const activeMenuWorker = require("./activeMenuWorker");
// const anotherWorker = require('./anotherWorker'); // add future workers here

const workers = [
  activeMenuWorker,
  // anotherWorker,
];

module.exports = workers;
