const activeMenuWorker = require("./activeMenuWorker");
const fiscalDocumentsWorker = require("./fiscalDocumentsWorker");

const workers = [
  activeMenuWorker,
  fiscalDocumentsWorker,
];

module.exports = workers;
