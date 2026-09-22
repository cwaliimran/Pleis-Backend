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
  const { getOrganizerParty } = require("../../paymentsIntegrations/billko/billkoCredentials");
  const party = await getOrganizerParty(invoice.companyOrganizer);
  return {
    sellerLegalName: party.companyName,
    sellerAddress: party.address,
    sellerOib: party.oib,
  };
}

function languageFromUserRef(userRef) {
  if (userRef && typeof userRef === "object" && userRef.language != null) {
    return userRef.language;
  }
  return null;
}

async function findUserProfile(userRef) {
  const populatedLang = languageFromUserRef(userRef);
  const populatedName =
    userRef && typeof userRef === "object"
      ? [userRef.firstName, userRef.lastName].filter(Boolean).join(" ").trim()
      : "";
  const populatedEmail =
    userRef && typeof userRef === "object" ? userRef.email || "" : "";
  if (populatedName && populatedLang != null && String(populatedLang).trim()) {
    return {
      language: String(populatedLang),
      buyerName: populatedName,
      buyerEmail: populatedEmail,
    };
  }
  const id = userRef && typeof userRef === "object" ? userRef._id : userRef;
  if (!id) {
    return {
      language: populatedLang || "",
      buyerName: populatedName,
      buyerEmail: populatedEmail,
    };
  }
  try {
    const { User } = require("../../../models/UserModel");
    const user = await User.findById(id).select("language firstName lastName email").lean();
    return {
      language: user?.language || populatedLang || "",
      buyerName:
        populatedName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim(),
      buyerEmail: populatedEmail || user?.email || "",
    };
  } catch (error) {
    return {
      language: populatedLang || "",
      buyerName: populatedName,
      buyerEmail: populatedEmail,
    };
  }
}

async function findUserLanguage(userRef) {
  const profile = await findUserProfile(userRef);
  return profile.language;
}

async function localeForInvoice(invoice, fallback) {
  const { resolveLocale, DEFAULT_LOCALE } = require("../locales");
  if (fallback) return resolveLocale(fallback);
  if (!invoice?.user) return DEFAULT_LOCALE;
  const language = await findUserLanguage(invoice.user);
  return resolveLocale(language || DEFAULT_LOCALE);
}

async function generateInvoicePdf(invoice, options = {}) {
  const { renderFiscalInvoiceHtml } = require("./htmlRenderer");
  const { htmlToPdfBuffer } = require("./htmlToPdf");
  const extras = await sellerExtrasForInvoice(invoice);
  const profile = await findUserProfile(invoice.user);
  extras.locale = await localeForInvoice(invoice, options.locale);
  extras.buyerName = profile.buyerName;
  extras.buyerEmail = profile.buyerEmail;
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

async function storeInvoicePdfIfAvailable(invoice, options = {}) {
  if (!invoice) return invoice;
  // Keep an existing Azure cache as-is (may be HR from an earlier generate).
  // Email/download always generate a fresh locale-correct PDF and must not
  // attach this cached file.
  if (invoice.pdfStorageKey && invoice.pdfFileUrl) return invoice;
  try {
    let buffer = invoice.__pdfBuffer;
    let fileName = invoice.__pdfFileName;
    if (!looksLikePdf(buffer)) {
      const pdf = await generateInvoicePdf(invoice, options);
      buffer = pdf.buffer;
      fileName = pdf.fileName;
    }
    const { uploadFilesToAzure } = require("../../../controllers/uploadAzureController");
    const BillkoInvoice = require("../models/BillkoInvoice.model");
    const uploaded = await uploadFilesToAzure([
      {
        buffer,
        originalname: fileName,
        mimetype: "application/pdf",
      },
    ]);
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    const update = {
      pdfStorageKey: file?.file || "",
      pdfFileUrl: file?.fileUrl || "",
      pdfFileName: fileName,
    };
    await BillkoInvoice.updateOne({ _id: invoice._id }, { $set: update });
    Object.assign(invoice, update);
    invoice.__pdfBuffer = buffer;
    invoice.__pdfFileName = fileName;
  } catch (error) {
    console.error("[billko] local invoice PDF failed:", error.message);
  }
  return invoice;
}

async function fetchInvoicePdf(invoice, options = {}) {
  if (invoice?.__pdfBuffer && looksLikePdf(invoice.__pdfBuffer)) {
    return {
      buffer: invoice.__pdfBuffer,
      fileName: invoice.__pdfFileName || invoicePdfFilename(invoice),
    };
  }
  const generated = await generateInvoicePdf(invoice, options);
  if (invoice) {
    invoice.__pdfBuffer = generated.buffer;
    invoice.__pdfFileName = generated.fileName;
  }
  return { buffer: generated.buffer, fileName: generated.fileName };
}

async function resolveInvoiceApiKey(invoice) {
  if (!invoice) return null;
  const {
    getPleisBillkoApiKey,
    getOrganizerBillkoApiKey,
  } = require("../../paymentsIntegrations/billko/billkoCredentials");
  if (invoice.seller === "pleis") return getPleisBillkoApiKey();
  if (!invoice.companyOrganizer) return null;
  const { apiKey } = await getOrganizerBillkoApiKey(invoice.companyOrganizer);
  return apiKey;
}

async function resolveCustomerEmail(userId) {
  if (!userId) return { email: "", language: "" };
  // Billko §2.1: checkout / billing email first, then account email.
  const { UserBillingInformation } = require("../../transactions/UserBillingInformation");
  const billing = await UserBillingInformation.findOne({
    user: userId,
    status: "active",
  })
    .select("email")
    .lean();
  let user = null;
  try {
    const { User } = require("../../../models/UserModel");
    user = await User.findById(userId).select("email language").lean();
  } catch (error) {
    user = null;
  }
  return {
    email: billing?.email || user?.email || "",
    language: user?.language || "",
  };
}

function renderTicketingInvoiceEmailHtml({
  locale,
  venueName,
  orderReference,
  invoiceNumbers,
  appDeepLink,
}) {
  const fs = require("fs");
  const path = require("path");
  const { getCopy, resolveLocale } = require("../locales");
  const { fillRawTokens, fillEscapedTokens } = require("../shared/html");
  const {
    resolvePleisWeb,
    resolvePleisSupportEmail,
  } = require("../../../config/CONSTANTS");
  const copy = getCopy(resolveLocale(locale));
  const ie = copy.invoiceEmail;
  const numbers = invoiceNumbers || "";
  const templatePath = path.join(__dirname, "../templates/invoice-email.html");
  let html = fs.readFileSync(templatePath, "utf8");
  html = fillRawTokens(html, {
    HTML_LANG: copy.htmlLang,
    EMAIL_TITLE: ie.title,
    EMAIL_HEADING: ie.heading,
    EMAIL_INTRO: ie.intro,
    EMAIL_ATTACH_NOTE: ie.attachNote,
    EMAIL_FOOTER: ie.footer,
    EMAIL_PREHEADER: typeof ie.preheader === "function" ? ie.preheader(numbers) : ie.preheader,
    LBL_VENUE: ie.labelVenue,
    LBL_ORDER: ie.labelOrder,
    LBL_INVOICES: ie.labelInvoices,
    OPEN_IN_APP: copy.openInApp,
  });
  html = fillEscapedTokens(html, {
    VENUE_NAME: venueName || "—",
    ORDER_REFERENCE: orderReference || "—",
    INVOICE_NUMBERS: numbers || "—",
    APP_DEEPLINK: appDeepLink || resolvePleisWeb(),
    SUPPORT_EMAIL: resolvePleisSupportEmail(),
    PLEIS_LEGAL_NAME: process.env.PLEIS_LEGAL_NAME || "Utopia Technologies d.o.o.",
    PLEIS_WEB: resolvePleisWeb(),
  });
  return html;
}

async function maybeEmailTicketingInvoicePdfs(orderNumber, userId) {
  if (!orderNumber) return { sent: false, reason: "missing_order_number" };

  const {
    isBillkoFiscalizeEnabled,
  } = require("../../paymentsIntegrations/billko/billkoClient");
  if (!isBillkoFiscalizeEnabled()) {
    console.log(
      "[billko] fiscalize disabled — skipping ticketing invoice PDF email",
      orderNumber,
    );
    return { sent: false, reason: "fiscalize_disabled" };
  }

  const BillkoInvoice = require("../models/BillkoInvoice.model");
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

  const customer = await resolveCustomerEmail(userId);
  const to = customer.email;
  if (!to) {
    console.error("[billko] invoice email not sent: customer email missing", orderNumber);
    return { sent: false, reason: "email_missing" };
  }

  const { getCopy, resolveLocale } = require("../locales");
  const locale = resolveLocale(customer.language);
  const copy = getCopy(locale);

  const attachments = [];
  for (const row of rows) {
    let pdf = null;
    try {
      pdf = await generateInvoicePdf(row, { locale });
      await storeInvoicePdfIfAvailable(
        Object.assign(row, {
          __pdfBuffer: pdf.buffer,
          __pdfFileName: pdf.fileName,
        }),
        { locale },
      );
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

  const numbers = rows.map((row) => row.invoiceNumber).filter(Boolean).join(", ");
  let venueName = "";
  try {
    const { TicketingOrders } = require("@TicketingOrdersModel");
    const Organizations = require("@OrganizationModel");
    const order = await TicketingOrders.findById(orderNumber)
      .select("organization")
      .lean();
    if (order?.organization) {
      const org = await Organizations.findById(order.organization)
        .select("basicInfo.name")
        .lean();
      venueName = org?.basicInfo?.name || "";
    }
  } catch (error) {
    venueName = "";
  }

  const { buildConfirmationOpenUrl } = require("../api/openAppRedirect");
  const html = renderTicketingInvoiceEmailHtml({
    locale,
    venueName,
    orderReference: orderNumber,
    invoiceNumbers: numbers,
    appDeepLink: buildConfirmationOpenUrl(orderNumber),
  });

  const { sendEmailViaMailgun } = require("../../../helperUtils/emailUtil");
  const {
    resolveMailFrom,
    resolvePleisSupportEmail,
  } = require("../../../config/CONSTANTS");
  const result = await sendEmailViaMailgun(
    to,
    copy.invoiceEmailSubject(numbers),
    html,
    {
      fromEmail: resolveMailFrom(),
      replyTo: resolvePleisSupportEmail(),
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
  localeForInvoice,
  generateInvoicePdf,
  fetchInvoicePdf,
  resolveInvoiceApiKey,
  storeInvoicePdfIfAvailable,
  resolveCustomerEmail,
  renderTicketingInvoiceEmailHtml,
  maybeEmailTicketingInvoicePdfs,
};
