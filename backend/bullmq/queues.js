const { Queue } = require("bullmq");
const connection = require("./connection");

const QUEUE_NAMES = {
  ACTIVE_MENU: "active-menu",
  FISCAL_DOCUMENTS: "fiscal-documents",
};

const activeMenuQueue = new Queue(QUEUE_NAMES.ACTIVE_MENU, {
  connection,
  skipVersionCheck: true,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const fiscalDocumentsQueue = new Queue(QUEUE_NAMES.FISCAL_DOCUMENTS, {
  connection,
  skipVersionCheck: true,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

activeMenuQueue.on("error", (err) => {
  console.error(`[queue] "${QUEUE_NAMES.ACTIVE_MENU}" error:`, err.message);
});

fiscalDocumentsQueue.on("error", (err) => {
  console.error(`[queue] "${QUEUE_NAMES.FISCAL_DOCUMENTS}" error:`, err.message);
});

async function enqueueFiscalDocument({ kind, orderId }) {
  if (!kind || !orderId) return null;
  return fiscalDocumentsQueue.add(
    kind,
    { kind, orderId: String(orderId) },
    { jobId: `${kind}-${orderId}` },
  );
}

module.exports = {
  QUEUE_NAMES,
  activeMenuQueue,
  fiscalDocumentsQueue,
  enqueueFiscalDocument,
};
