const PDF_MAGIC = Buffer.from("%PDF");

function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.slice(0, 4).equals(PDF_MAGIC);
}

function invoicePdfFilename(result = {}, fallback = "invoice") {
  const raw = String(result.fileName || result.pdfFileName || "").trim();
  if (raw.toLowerCase().endsWith(".pdf")) {
    return raw.replace(/[/\\]/g, "_");
  }
  const number = result.invoiceNumber || fallback || "invoice";
  return `${String(number).replace(/[/\\]/g, "_")}.pdf`;
}

function stripPdfPayload(result) {
  if (!result || typeof result !== "object") return result;
  const raw = { ...result };
  delete raw.base64Content;
  delete raw.contentBase64;
  delete raw.pdfBase64;
  return raw;
}

function buildInvoicePdfAttachment({ buffer, fileName, invoiceNumber }) {
  const filename = invoicePdfFilename(
    { fileName, invoiceNumber },
    invoiceNumber || "invoice",
  );
  return {
    filename,
    data: buffer,
    contentType: "application/pdf",
  };
}

async function sellerExtrasForInvoice(invoice) {
  if (invoice.seller === "pleis") {
    return {
      sellerLegalName: process.env.PLEIS_LEGAL_NAME || "UTOPIA TECHNOLOGIES d.o.o.",
      sellerAddress: process.env.PLEIS_ADDRESS || "",
      sellerOib: process.env.PLEIS_OIB || "",
    };
  }
  const { getOrganizerParty } = require("../paymentsIntegrations/billko/billkoCredentials");
  const party = await getOrganizerParty(invoice.companyOrganizer);
  return {
    sellerLegalName: party.companyName,
    sellerAddress: party.address,
    sellerOib: party.oib,
  };
}

async function generateInvoicePdf(invoice) {
  const { renderFiscalInvoiceHtml } = require("./invoiceHtmlRenderer");
  const { htmlToPdfBuffer } = require("./htmlToPdf");
  const extras = await sellerExtrasForInvoice(invoice);
  const html = renderFiscalInvoiceHtml(invoice, extras);
  const buffer = await htmlToPdfBuffer(html);
  if (!looksLikePdf(buffer)) {
    throw new Error("local_invoice_pdf_invalid");
  }
  return {
    buffer,
    fileName: invoicePdfFilename(
      { invoiceNumber: invoice.invoiceNumber, fileName: invoice.pdfFileName },
      invoice.kind || "invoice",
    ),
    html,
  };
}

async function storeInvoicePdfIfAvailable(invoice) {
  if (!invoice) return invoice;
  if (invoice.pdfStorageKey && invoice.pdfFileUrl) return invoice;
  try {
    const pdf = await generateInvoicePdf(invoice);
    const { uploadFilesToAzure } = require("../../controllers/uploadAzureController");
    const BillkoInvoice = require("./BillkoInvoice.model");
    const uploaded = await uploadFilesToAzure([
      {
        buffer: pdf.buffer,
        originalname: pdf.fileName,
        mimetype: "application/pdf",
      },
    ]);
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    const update = {
      pdfStorageKey: file?.file || "",
      pdfFileUrl: file?.fileUrl || "",
      pdfFileName: pdf.fileName,
    };
    await BillkoInvoice.updateOne({ _id: invoice._id }, { $set: update });
    Object.assign(invoice, update);
    invoice.__pdfBuffer = pdf.buffer;
    invoice.__pdfFileName = pdf.fileName;
  } catch (error) {
    console.error("[billko] local invoice PDF failed:", error.message);
  }
  return invoice;
}

async function fetchInvoicePdf(invoice) {
  if (invoice?.__pdfBuffer && looksLikePdf(invoice.__pdfBuffer)) {
    return {
      buffer: invoice.__pdfBuffer,
      fileName: invoice.__pdfFileName || invoicePdfFilename(invoice),
    };
  }
  const generated = await generateInvoicePdf(invoice);
  return { buffer: generated.buffer, fileName: generated.fileName };
}

async function resolveInvoiceApiKey(invoice) {
  if (!invoice) return null;
  const {
    getPleisBillkoApiKey,
    getOrganizerBillkoApiKey,
  } = require("../paymentsIntegrations/billko/billkoCredentials");
  if (invoice.seller === "pleis") return getPleisBillkoApiKey();
  if (!invoice.companyOrganizer) return null;
  const { apiKey } = await getOrganizerBillkoApiKey(invoice.companyOrganizer);
  return apiKey;
}

async function resolveCustomerEmail(userId) {
  if (!userId) return "";
  const User = require("mongoose").model("User");
  const user = await User.findById(userId).select("email").lean();
  if (user?.email) return user.email;
  const { UserBillingInformation } = require("../transactions/UserBillingInformation");
  const billing = await UserBillingInformation.findOne({
    user: userId,
    status: "active",
  })
    .select("email")
    .lean();
  return billing?.email || "";
}

async function maybeEmailTicketingInvoicePdfs(orderNumber, userId) {
  if (!orderNumber) return { sent: false, reason: "missing_order_number" };
  const BillkoInvoice = require("./BillkoInvoice.model");
  const rows = await BillkoInvoice.find({
    orderNumber,
    kind: { $in: ["tickets", "service_fee"] },
  });
  if (!rows.some((row) => row.kind === "tickets")) {
    console.warn("[billko] skip invoice email: no tickets invoice", orderNumber);
    return { sent: false, reason: "no_tickets_invoice" };
  }
  if (rows.some((row) => row.pdfEmailedAt)) {
    console.warn("[billko] skip invoice email: already emailed", orderNumber);
    return { sent: false, reason: "already_emailed" };
  }

  const attachments = [];
  for (const row of rows) {
    await storeInvoicePdfIfAvailable(row);
    let pdf = null;
    try {
      pdf = await fetchInvoicePdf(row);
    } catch (error) {
      console.warn("[billko] local PDF failed:", row.kind, error.message);
    }
    if (!pdf) continue;
    const attachment = buildInvoicePdfAttachment({
      buffer: pdf.buffer,
      fileName: pdf.fileName || row.pdfFileName,
      invoiceNumber: row.invoiceNumber,
    });
    if (!attachment.filename.toLowerCase().endsWith(".pdf")) continue;
    attachments.push(attachment);
  }
  if (!attachments.length) {
    console.error("[billko] invoice email not sent: no PDF attachments", orderNumber);
    return { sent: false, reason: "pdf_not_available" };
  }

  const to = await resolveCustomerEmail(userId);
  if (!to) {
    console.error("[billko] invoice email not sent: customer email missing", orderNumber);
    return { sent: false, reason: "email_missing" };
  }

  const numbers = rows.map((row) => row.invoiceNumber).filter(Boolean).join(", ");
  const { sendEmailViaMailgun } = require("../../helperUtils/emailUtil");
  const result = await sendEmailViaMailgun(
    to,
    numbers ? `Račun ${numbers}` : "Račun",
    "<p>U privitku su fiskalizirani računi za vašu kupnju.</p>",
    {
      fromEmail: `Pleis <noreply@${process.env.MAILGUN_DOMAIN || "pleis.ai"}>`,
      replyTo: process.env.PLEIS_SUPPORT_EMAIL || "support@pleis.hr",
      attachments,
    },
  );
  if (result?.success) {
    await BillkoInvoice.updateMany(
      { _id: { $in: rows.map((row) => row._id) } },
      { $set: { pdfEmailedAt: new Date() } },
    );
    console.log("[billko] invoice PDF email sent to", to, "order", orderNumber);
    return { sent: true, to, attachments: attachments.length };
  }
  console.error("[billko] invoice email Mailgun failed:", result?.error?.message || result?.error);
  return { sent: false, reason: "mailgun_failed" };
}

module.exports = {
  looksLikePdf,
  invoicePdfFilename,
  stripPdfPayload,
  buildInvoicePdfAttachment,
  generateInvoicePdf,
  fetchInvoicePdf,
  resolveInvoiceApiKey,
  storeInvoicePdfIfAvailable,
  maybeEmailTicketingInvoicePdfs,
};
