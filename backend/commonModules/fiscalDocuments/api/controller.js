const PaymentConfirmation = require("../models/PaymentConfirmation.model");
const BillkoInvoice = require("../models/BillkoInvoice.model");
const { sendResponse } = require("../../../helperUtils/responseUtil");
const {
  canViewConfirmation,
  canViewInvoice,
  redactInvoiceForRole,
} = require("./access");
const {
  fetchInvoicePdf,
  storeInvoicePdfIfAvailable,
  looksLikePdf,
} = require("../invoice/pdf");
const { htmlToPdfBuffer } = require("../invoice/htmlToPdf");
const {
  renderPaymentConfirmationHtml,
  formatZagreb,
  escapeHtml,
} = require("../confirmation/htmlRenderer");
const { resolveLocale, humanPaymentMethod } = require("../locales");
const { buildConfirmationOpenUrl } = require("./openAppRedirect");
const {
  resolvePleisWeb,
  resolvePleisSupportEmail,
} = require("../../../config/CONSTANTS");

async function regenerateConfirmationPdf(doc) {
  const locale = resolveLocale(doc.locale);
  const items = doc.items || [];
  const view = {
    pleisLegalName: process.env.PLEIS_LEGAL_NAME || "Utopia Technologies d.o.o.",
    pleisOib: process.env.PLEIS_OIB || "",
    pleisAddress: process.env.PLEIS_ADDRESS || "",
    pleisBrand: process.env.PLEIS_BRAND || "PLEIS",
    pleisWeb: resolvePleisWeb(),
    supportEmail: resolvePleisSupportEmail(),
    locale,
    confirmationNumber: doc.confirmationNumber,
    issuedAt: doc.issuedAt,
    issuedAtFormatted: formatZagreb(doc.issuedAt, locale),
    documentHash: doc.documentHash || "",
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    customerFirstName: (doc.customerName || "").split(" ")[0] || "",
    transactionId: doc.transactionId,
    orderReference: doc.orderReference,
    paidAt: doc.paidAt,
    paidAtFormatted: formatZagreb(doc.paidAt, locale),
    paymentMethod: humanPaymentMethod(doc.paymentMethod, locale, {
      cardLast4: doc.cardLast4,
      cardBrand: doc.cardBrand,
    }),
    currency: doc.currency || "EUR",
    totalAmount: (doc.amountCents || 0) / 100,
    organizerLegalName: "",
    organizerVenueName: "",
    organizerAddress: "",
    organizerOib: "",
    items,
    voucher: doc.voucher,
    voucherValidFromFormatted: doc.voucher?.validFrom
      ? formatZagreb(doc.voucher.validFrom, locale)
      : "",
    voucherValidToFormatted: doc.voucher?.validTo
      ? formatZagreb(doc.voucher.validTo, locale)
      : "",
    itemRowsHtml: items
      .map((item) => {
        const vat = item.vatPercent == null ? "" : `${item.vatPercent}%`;
        return `<tr><td class="l">${escapeHtml(item.name || "")}</td><td>${vat}</td><td>${item.quantity}</td><td>${Number(item.unitPrice || 0).toFixed(2)}</td><td>${Number(item.amount || 0).toFixed(2)}</td></tr>`;
      })
      .join(""),
    emailItemRowsHtml: "",
    appDeepLink: buildConfirmationOpenUrl(doc.confirmationNumber),
    documentUrl: doc.pdfFileUrl || "",
    isCancellation: Boolean(doc.cancelsConfirmationId),
    cancelledConfirmationNumber: "",
  };
  const html = renderPaymentConfirmationHtml(view, { injectActions: false });
  const buffer = await htmlToPdfBuffer(html);
  if (!looksLikePdf(buffer)) return null;
  return { buffer, fileName: `${doc.confirmationNumber}.pdf` };
}

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
      return sendResponse({
        res,
        statusCode: 200,
        data: {
          ...doc,
          openUrl: buildConfirmationOpenUrl(doc.confirmationNumber),
          pdfAvailable: Boolean(doc.pdfFileUrl || doc.pdfStorageKey),
          deliveryStatus: doc.deliveryStatus || "pending",
        },
      });
    }

    // Prefer stored PDF on Azure (Billko §10.2). Fall back to regenerate.
    if (doc.pdfFileUrl && String(req.query.format).toLowerCase() !== "download") {
      return res.redirect(doc.pdfFileUrl);
    }

    let pdf = null;
    if (doc.pdfFileUrl) {
      try {
        const axios = require("axios");
        const response = await axios.get(doc.pdfFileUrl, {
          responseType: "arraybuffer",
          timeout: 30000,
        });
        const buffer = Buffer.from(response.data);
        if (looksLikePdf(buffer)) {
          pdf = { buffer, fileName: `${doc.confirmationNumber}.pdf` };
        }
      } catch (error) {
        console.warn("[confirmation] azure PDF fetch failed:", error.message);
      }
    }
    if (!pdf) {
      pdf = await regenerateConfirmationPdf(doc);
    }
    if (!pdf) {
      // Legacy HTML-only confirmations issued before Sprint A.
      if (doc.htmlFileUrl) {
        return res.redirect(doc.htmlFileUrl);
      }
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "document_not_stored",
      });
    }
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

async function getInvoiceDocument(req, res) {
  try {
    const invoice = await BillkoInvoice.findById(req.params.id)
      .populate("user", "language")
      .lean();
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

    const locale = invoice.user?.language;
    const pdf = await fetchInvoicePdf(invoice, { locale });
    if (!pdf) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "document_not_stored",
      });
    }
    storeInvoicePdfIfAvailable(invoice, { locale }).catch((error) => {
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
