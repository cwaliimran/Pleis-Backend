/**
 * Admin HTTP handlers for Phase B payout statements.
 * Mounted under /api/v1/admin/payout-statements (and /payouts alias).
 */

const { sendResponse } = require("../../../helperUtils/responseUtil");
const service = require("./statementService");

function actorId(req) {
  return req.user?._id || req.user?.id || null;
}

async function generate(req, res) {
  try {
    const endDay =
      req.body?.endDay ||
      req.body?.periodEnd ||
      req.query?.endDay ||
      req.query?.periodEnd;
    if (!endDay) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_day_required",
        translateMessage: false,
      });
    }
    const result = await service.generateStatement({
      endDay,
      actorId: actorId(req),
      notes: req.body?.notes || "",
    });
    if (result.empty) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "payout_statement_empty",
        translateMessage: false,
        data: result,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "payout_statement_generated",
      translateMessage: false,
      data: {
        ...result,
        downloadPath: `/api/v1/admin/payout-statements/${result.statement.batchReference}/pain001`,
      },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_generate_failed",
      translateMessage: false,
      error: err.message,
      data: err.incompleteOrganizers
        ? { incompleteOrganizers: err.incompleteOrganizers }
        : null,
    });
  }
}

async function list(req, res) {
  try {
    const limit = Number(req.query.limit || 50);
    const skip = Number(req.query.skip || 0);
    const includeCancelled =
      String(req.query.includeCancelled || "") === "true";
    const result = await service.listStatements({
      limit,
      skip,
      includeCancelled,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "payout_statements",
      translateMessage: false,
      data: result.items,
      meta: { total: result.total, limit, skip },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_list_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function getOne(req, res) {
  try {
    const includeXml = String(req.query.includeXml || "") === "true";
    const statement = await service.getStatement(req.params.id, { includeXml });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "payout_statement",
      translateMessage: false,
      data: statement,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_get_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function download(req, res) {
  try {
    const file = await service.downloadPain001(req.params.id);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    );
    res.setHeader("X-Pleis-Statement-Id", file.statement.batchReference);
    res.setHeader("X-Pleis-Pain001-Hash", file.statement.pain001Hash || "");
    return res.status(200).send(file.xml);
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_download_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function confirm(req, res) {
  try {
    const statement = await service.confirmStatement(req.params.id, {
      actorId: actorId(req),
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "payout_statement_confirmed",
      translateMessage: false,
      data: statement,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_confirm_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function cancel(req, res) {
  try {
    const statement = await service.cancelStatement(req.params.id, {
      actorId: actorId(req),
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "payout_statement_cancelled",
      translateMessage: false,
      data: statement,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "payout_cancel_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function excludeEntry(req, res) {
  try {
    const data = await service.excludeLedgerEntry(req.params.entryId, {
      reason: req.body?.reason,
      userId: actorId(req),
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ledger_entry_excluded",
      translateMessage: false,
      data,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "exclude_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

const fiscalizeService = require("./fiscalizeService");
const offAppFiscalizeService = require("./offAppFiscalizeService");
const billkoB2bDocumentsService = require("./billkoB2bDocumentsService");

async function fiscalize(req, res) {
  try {
    const result = await fiscalizeService.fiscalizePaidOut({
      actorId: actorId(req),
      notes: req.body?.notes || "",
      forceLive: req.body?.forceLive === true,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: result.live
        ? "fiscalize_completed"
        : "fiscalize_dry_run",
      translateMessage: false,
      data: result,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "fiscalize_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function listFiscalizeRuns(req, res) {
  try {
    const result = await fiscalizeService.listFiscalizeRuns({
      limit: Number(req.query.limit || 50),
      skip: Number(req.query.skip || 0),
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "fiscalize_runs",
      translateMessage: false,
      data: result.items,
      meta: { total: result.total },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "fiscalize_list_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function generateOffApp(req, res) {
  try {
    const endDay = req.body?.endDay || req.body?.periodEnd;
    const result = await offAppFiscalizeService.generateOffAppBatch({
      endDay,
      periodStartDay: req.body?.periodStart || req.body?.periodStartDay,
      actorId: actorId(req),
      notes: req.body?.notes || "",
    });
    if (result.empty) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "offapp_batch_empty",
        translateMessage: false,
        data: result,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "offapp_batch_generated",
      translateMessage: false,
      data: result,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "offapp_generate_failed",
      translateMessage: false,
      error: err.message,
      data: err.existing ? { existing: err.existing } : null,
    });
  }
}

async function listOffApp(req, res) {
  try {
    const result = await offAppFiscalizeService.listOffAppBatches({
      limit: Number(req.query.limit || 50),
      skip: Number(req.query.skip || 0),
      includeCancelled: String(req.query.includeCancelled || "") === "true",
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "offapp_batches",
      translateMessage: false,
      data: result.items,
      meta: { total: result.total },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "offapp_list_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function getOffApp(req, res) {
  try {
    const batch = await offAppFiscalizeService.getOffAppBatch(req.params.id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "offapp_batch",
      translateMessage: false,
      data: batch,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "offapp_get_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function confirmOffApp(req, res) {
  try {
    const result = await offAppFiscalizeService.confirmOffAppBatch(req.params.id, {
      actorId: actorId(req),
      forceLive: req.body?.forceLive === true,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: result.live
        ? "offapp_batch_confirmed"
        : "offapp_batch_dry_run",
      translateMessage: false,
      data: result,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "offapp_confirm_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function cancelOffApp(req, res) {
  try {
    const batch = await offAppFiscalizeService.cancelOffAppBatch(req.params.id, {
      actorId: actorId(req),
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "offapp_batch_cancelled",
      translateMessage: false,
      data: batch,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.message || "offapp_cancel_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function billkoLakeStatus(req, res) {
  try {
    const data = await billkoB2bDocumentsService.getLakeStatus();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "billko_lake_status",
      translateMessage: false,
      data,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "billko_lake_status_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function billkoIncoming(req, res) {
  try {
    const data = await billkoB2bDocumentsService.listIncoming(req.query);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "billko_incoming_documents",
      translateMessage: false,
      data: data.items,
      meta: { count: data.count },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "billko_incoming_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function billkoOutgoing(req, res) {
  try {
    const data = await billkoB2bDocumentsService.listOutgoing(req.query);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "billko_outgoing_documents",
      translateMessage: false,
      data: data.items,
      meta: { count: data.count },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "billko_outgoing_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function billkoDocumentStatus(req, res) {
  try {
    const data = await billkoB2bDocumentsService.getStatus(req.params.documentId);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "billko_document_status",
      translateMessage: false,
      data,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "billko_document_status_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

async function billkoReportPayment(req, res) {
  try {
    const data = await billkoB2bDocumentsService.reportPayment({
      documentId: req.params.documentId,
      paymentDate: req.body?.paymentDate,
      paidAmount: req.body?.paidAmount,
      paymentType: req.body?.paymentType,
      invoiceId: req.body?.invoiceId,
      orderNumber: req.body?.orderNumber,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "billko_payment_reported",
      translateMessage: false,
      data,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err.statusCode || 500,
      translationKey: err.code || err.message || "billko_report_payment_failed",
      translateMessage: false,
      error: err.message,
    });
  }
}

module.exports = {
  generate,
  list,
  getOne,
  download,
  confirm,
  cancel,
  excludeEntry,
  fiscalize,
  listFiscalizeRuns,
  generateOffApp,
  listOffApp,
  getOffApp,
  confirmOffApp,
  cancelOffApp,
  billkoLakeStatus,
  billkoIncoming,
  billkoOutgoing,
  billkoDocumentStatus,
  billkoReportPayment,
};
