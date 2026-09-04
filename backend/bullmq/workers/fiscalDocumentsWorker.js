const { Worker } = require("bullmq");
const connection = require("../connection");
const { QUEUE_NAMES } = require("../queues");
const {
  handleSuccessfulPayment,
} = require("../../commonModules/fiscalDocuments/documentService");
const {
  billkoErrorDetails,
} = require("../../commonModules/paymentsIntegrations/billko/billkoClient");

function summarizeFiscalResult(result) {
  if (!result) return { skipped: true };
  const invoices = Array.isArray(result)
    ? result
    : Array.isArray(result.invoices)
      ? result.invoices
      : [];
  return {
    skipped: false,
    invoices: invoices.filter(Boolean).map((invoice) => ({
      kind: invoice.kind,
      seller: invoice.seller,
      billkoId: invoice.billkoId || null,
      invoiceNumber: invoice.invoiceNumber || null,
      status: invoice.status || null,
    })),
    confirmationId: result.confirmation?._id || result.confirmationNumber || null,
  };
}

const fiscalDocumentsWorker = new Worker(
  QUEUE_NAMES.FISCAL_DOCUMENTS,
  async (job) => {
    const result = await handleSuccessfulPayment(job.data);
    return summarizeFiscalResult(result);
  },
  {
    connection,
    skipVersionCheck: true,
    concurrency: 3,
  },
);

fiscalDocumentsWorker.on("completed", (job, result) => {
  console.log(
    `[fiscal-documents] job ${job?.id} succeeded:`,
    JSON.stringify({
      kind: job?.data?.kind,
      orderId: job?.data?.orderId,
      ...(result || {}),
    }),
  );
});

fiscalDocumentsWorker.on("failed", (job, err) => {
  console.error(
    `[fiscal-documents] job ${job?.id} failed:`,
    JSON.stringify({
      kind: job?.data?.kind,
      orderId: job?.data?.orderId,
      message: err?.message || String(err),
      ...billkoErrorDetails(err),
    }),
  );
});

module.exports = fiscalDocumentsWorker;
