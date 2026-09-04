const { Worker } = require("bullmq");
const connection = require("../connection");
const { QUEUE_NAMES } = require("../queues");
const {
  handleSuccessfulPayment,
} = require("../../commonModules/fiscalDocuments/documentService");

const fiscalDocumentsWorker = new Worker(
  QUEUE_NAMES.FISCAL_DOCUMENTS,
  async (job) => handleSuccessfulPayment(job.data),
  {
    connection,
    skipVersionCheck: true,
    concurrency: 3,
  },
);

fiscalDocumentsWorker.on("failed", (job, err) => {
  console.error(
    `[fiscal-documents] job ${job?.id} failed:`,
    err?.message || err,
  );
});

module.exports = fiscalDocumentsWorker;
