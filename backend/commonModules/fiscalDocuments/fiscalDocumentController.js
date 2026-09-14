const PaymentConfirmation = require("./PaymentConfirmation.model");
const BillkoInvoice = require("./BillkoInvoice.model");
const { sendResponse } = require("../../helperUtils/responseUtil");
const {
  canViewConfirmation,
  canViewInvoice,
  redactInvoiceForRole,
} = require("./fiscalDocumentAccess");
const {
  fetchInvoicePdf,
  storeInvoicePdfIfAvailable,
} = require("./billkoInvoicePdf");

async function getConfirmationDocument(req, res) {
  try {
    const doc = await PaymentConfirmation.findOne({
      confirmationNumber: req.params.confirmationNumber,
    }).lean();
    if (!doc || !canViewConfirmation(req.user, doc)) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "not_found",
      });
    }
    if (String(req.query.format).toLowerCase() === "json") {
      return sendResponse({ res, statusCode: 200, data: doc });
    }
    if (doc.htmlFileUrl) {
      return res.redirect(doc.htmlFileUrl);
    }
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "document_not_stored",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error.message,
    });
  }
}

async function getInvoiceDocument(req, res) {
  try {
    const invoice = await BillkoInvoice.findById(req.params.id).lean();
    if (!invoice || !canViewInvoice(req.user, invoice)) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "not_found",
      });
    }
    if (String(req.query.format).toLowerCase() === "json") {
      return sendResponse({
        res,
        statusCode: 200,
        data: redactInvoiceForRole(req.user, invoice),
      });
    }

    const pdf = await fetchInvoicePdf(invoice);
    if (!pdf) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "document_not_stored",
      });
    }
    storeInvoicePdfIfAvailable(invoice).catch((error) => {
      console.error("[billko] invoice PDF cache failed:", error.message);
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(pdf.fileName).replace(/"/g, "")}"`,
    );
    return res.send(pdf.buffer);
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error.message,
    });
  }
}

module.exports = {
  getConfirmationDocument,
  getInvoiceDocument,
};
