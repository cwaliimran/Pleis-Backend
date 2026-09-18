const moment = require("moment-timezone");
const { customAlphabet } = require("nanoid");
const PaymentConfirmation = require("../models/PaymentConfirmation.model");
const PaymentConfirmationSequence = require("../models/PaymentConfirmationSequence.model");
const {
  renderPaymentConfirmationHtml,
  renderPaymentConfirmationEmailHtml,
  formatZagreb,
  escapeHtml,
} = require("./htmlRenderer");
const { displayPercent } = require("../../paymentsIntegrations/billko/taxRateLabels");
const {
  DEFAULT_LOCALE,
  resolveLocale,
  getCopy,
  humanPaymentMethod,
} = require("../locales");
const {
  snapshotCardFromMonriPayload,
  computeHtmlHash,
  computePdfHash,
  mapOrderItems,
} = require("./helpers");
const { uploadFilesToAzure } = require("../../../controllers/uploadAzureController");
const { sendEmailViaMailgun } = require("../../../helperUtils/emailUtil");
const { buildConfirmationOpenUrl } = require("../api/openAppRedirect");
const { htmlToPdfBuffer } = require("../invoice/htmlToPdf");
const { logoInlineAttachment, resolveLogoSrc } = require("../shared/logo");
const {
  resolvePleisWeb,
  resolvePleisSupportEmail,
  resolveMailFrom,
} = require("../../../config/CONSTANTS");

const PDF_MAGIC = Buffer.from("%PDF");
function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.slice(0, 4).equals(PDF_MAGIC);
}

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const voucherChunk = customAlphabet(VOUCHER_ALPHABET, 4);
const BILLKO_TZ = "Europe/Zagreb";

function generateVoucherCode() {
  return `PLS-${voucherChunk()}-${voucherChunk()}-${voucherChunk()}`;
}

async function allocateConfirmationNumber() {
  const year = moment().tz(BILLKO_TZ).year();
  const doc = await PaymentConfirmationSequence.findOneAndUpdate(
    { _id: `pc_${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return `PC-${year}-${String(doc.seq).padStart(8, "0")}`;
}

function staticPleisConfig() {
  return {
    pleisLegalName: process.env.PLEIS_LEGAL_NAME || "Utopia Technologies d.o.o.",
    pleisOib: process.env.PLEIS_OIB || "",
    pleisAddress: process.env.PLEIS_ADDRESS || "",
    pleisBrand: process.env.PLEIS_BRAND || "PLEIS",
    pleisWeb: resolvePleisWeb(),
    supportEmail: resolvePleisSupportEmail(),
  };
}

function buildItemRows(items) {
  return items
    .map((item) => {
      const isMeta = Boolean(item.isOption);
      const vat =
        isMeta || item.vatPercent == null ? "" : `${item.vatPercent}%`;
      const indentClass = isMeta ? ' class="opt"' : "";
      const qty = isMeta ? "" : item.quantity;
      const unit = isMeta ? "" : Number(item.unitPrice).toFixed(2);
      const amount = isMeta ? "" : Number(item.amount).toFixed(2);
      return `<tr${indentClass}><td class="l">${escapeHtml(item.name)}</td><td>${vat}</td><td>${qty}</td><td>${unit}</td><td>${amount}</td></tr>`;
    })
    .join("");
}

function buildEmailItemRows(items) {
  return items
    .map((item) => {
      const isMeta = Boolean(item.isOption);
      if (isMeta) {
        return `<tr><td colspan="2" style="padding:4px 0;font-size:12px;color:#6B7280;">${escapeHtml(item.name)}</td></tr>`;
      }
      return `<tr><td style="padding:4px 0;font-size:13px;color:#14181F;">${escapeHtml(item.name)} × ${item.quantity}</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#14181F;">${Number(item.amount).toFixed(2)}</td></tr>`;
    })
    .join("");
}

async function issuePaymentConfirmation(input) {
  const existing = await PaymentConfirmation.findOne({
    orderId: input.orderId,
    module: input.module,
    $or: [
      { cancelsConfirmationId: null },
      { cancelsConfirmationId: { $exists: false } },
    ],
  });
  if (existing) {
    if (existing.status === "CANCELLED") return existing;
    if (!existing.pdfStorageKey) {
      return regenerateAndStore(existing, input);
    }
    // Idempotent email: only send once unless explicit resend.
    if (!existing.emailSentAt) {
      await emailConfirmation(existing, input);
    }
    return existing;
  }

  const confirmationNumber = await allocateConfirmationNumber();
  const issuedAt = new Date();
  const items = input.items || [];
  const amountCents = Math.round(Number(input.amount || 0) * 100);
  const locale = resolveLocale(input.locale);
  const card = snapshotCardFromMonriPayload(input.rawCallback || {});
  const cardLast4 = input.cardLast4 || card.cardLast4;
  const cardBrand = input.cardBrand || card.cardBrand;

  const record = await PaymentConfirmation.create({
    confirmationNumber,
    transactionId: input.transactionId,
    orderReference: input.orderReference,
    orderId: input.orderId,
    module: input.module,
    organizerCompanyId: input.organizerCompanyId,
    organization: input.organization,
    customerUserId: input.customerUserId || null,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod || "card",
    cardLast4: cardLast4 || undefined,
    cardBrand: cardBrand || undefined,
    amountCents,
    currency: input.currency || "EUR",
    items,
    voucherId: input.voucher?.code || null,
    voucher: input.voucher || undefined,
    status: "ISSUED",
    issuedAt,
    locale,
    cancelsConfirmationId: input.cancelsConfirmationId || null,
    deliveryStatus: "pending",
  });

  return regenerateAndStore(record, input);
}

async function issueCancellationConfirmation(original, input = {}) {
  if (!original?._id) throw new Error("original_confirmation_required");
  const existingCancel = await PaymentConfirmation.findOne({
    cancelsConfirmationId: original._id,
  });
  if (existingCancel) return existingCancel;

  const confirmationNumber = await allocateConfirmationNumber();
  const issuedAt = new Date();
  const locale = resolveLocale(input.locale || original.locale);
  const amountCents =
    input.amount != null
      ? Math.round(Number(input.amount) * 100)
      : original.amountCents;

  const record = await PaymentConfirmation.create({
    confirmationNumber,
    transactionId: input.transactionId || original.transactionId,
    orderReference: original.orderReference,
    orderId: original.orderId,
    module: original.module,
    organizerCompanyId: original.organizerCompanyId,
    organization: original.organization,
    customerUserId: original.customerUserId || null,
    customerName: original.customerName,
    customerEmail: original.customerEmail,
    paidAt: original.paidAt,
    paymentMethod: original.paymentMethod,
    cardLast4: original.cardLast4,
    cardBrand: original.cardBrand,
    amountCents,
    currency: original.currency || "EUR",
    items: original.items || [],
    voucherId: original.voucherId,
    voucher: original.voucher,
    status: "ISSUED",
    issuedAt,
    locale,
    cancelsConfirmationId: original._id,
    deliveryStatus: "pending",
  });

  if (original.status !== "CANCELLED") {
    original.status = "CANCELLED";
    await original.save();
  }

  // Min-spend reservation vouchers cannot be redeemed after refund.
  if (original.module === "RESERVATION" && original.orderId) {
    try {
      const { UserReservations } = require("../../reservations/UsersReservation");
      await UserReservations.updateOne(
        {
          _id: original.orderId,
          "voucher.code": { $exists: true, $nin: [null, ""] },
        },
        { $set: { "voucher.status": "cancelled" } },
      );
    } catch (error) {
      console.warn(
        "[confirmation] voucher cancel on refund failed:",
        error.message,
      );
    }
  }

  return regenerateAndStore(record, {
    ...input,
    isCancellation: true,
    cancelledConfirmationNumber: original.confirmationNumber,
    organizerLegalName: input.organizerLegalName,
    organizerVenueName: input.organizerVenueName,
    organizerAddress: input.organizerAddress,
    organizerOib: input.organizerOib,
    locale,
  });
}

async function regenerateAndStore(record, input) {
  if (Array.isArray(input.items) && input.items.length) {
    record.items = input.items;
  }
  if (input.amount != null) {
    record.amountCents = Math.round(Number(input.amount) * 100);
  }
  if (input.voucher) {
    record.voucher = input.voucher;
    record.voucherId = input.voucher.code || record.voucherId;
  }
  const view = buildViewModel(record, input);
  view.documentHash = "";
  // Intermediate HTML → PDF. Hash is of PDF bytes (unsigned pass), then stamped into final PDF.
  const unsignedHtml = renderPaymentConfirmationHtml(view, { injectActions: false });
  const unsignedPdf = await htmlToPdfBuffer(unsignedHtml);
  if (!looksLikePdf(unsignedPdf)) {
    throw new Error("confirmation_pdf_invalid");
  }
  const documentHash = computePdfHash(unsignedPdf);
  view.documentHash = documentHash;
  const stampedHtml = renderPaymentConfirmationHtml(view, { injectActions: false });
  const pdfBuffer = await htmlToPdfBuffer(stampedHtml);
  if (!looksLikePdf(pdfBuffer)) {
    throw new Error("confirmation_pdf_invalid");
  }
  const filename = `${record.confirmationNumber}.pdf`;

  const uploaded = await uploadFilesToAzure([
    {
      buffer: pdfBuffer,
      originalname: filename,
      mimetype: "application/pdf",
    },
  ]);
  const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

  record.documentHash = documentHash;
  record.pdfStorageKey = file?.file || "";
  record.pdfFileUrl = file?.fileUrl || "";
  record.htmlStorageKey = "";
  record.htmlFileUrl = "";
  record.__pdfBuffer = pdfBuffer;
  record.__pdfFileName = filename;
  await record.save();

  view.documentUrl = record.pdfFileUrl;
  view.documentHash = documentHash;
  // Do not double-send on PDF regenerate; resend must be explicit.
  if (!record.emailSentAt || input.forceResend === true) {
    await emailConfirmation(record, input, view);
  }
  return record;
}

function buildViewModel(record, input = {}) {
  const staticCfg = staticPleisConfig();
  const items = input.items || record.items || [];
  const voucher = input.voucher || record.voucher;
  const currency = record.currency || "EUR";
  const locale = resolveLocale(input.locale || record.locale || DEFAULT_LOCALE);
  return {
    ...staticCfg,
    locale,
    confirmationNumber: record.confirmationNumber,
    issuedAt: record.issuedAt,
    issuedAtFormatted: formatZagreb(record.issuedAt, locale),
    documentHash: record.documentHash,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    customerFirstName: (record.customerName || "").split(" ")[0] || "",
    transactionId: record.transactionId,
    orderReference: record.orderReference,
    paidAt: record.paidAt,
    paidAtFormatted: formatZagreb(record.paidAt, locale),
    paymentMethod: humanPaymentMethod(record.paymentMethod, locale, {
      cardLast4: record.cardLast4 || input.cardLast4,
      cardBrand: record.cardBrand || input.cardBrand,
    }),
    currency,
    totalAmount: (record.amountCents || 0) / 100,
    organizerLegalName: input.organizerLegalName || "",
    organizerVenueName: input.organizerVenueName || "",
    organizerAddress: input.organizerAddress || "",
    organizerOib: input.organizerOib || "",
    items,
    voucher,
    voucherValidFromFormatted: voucher?.validFrom
      ? formatZagreb(voucher.validFrom, locale)
      : "",
    voucherValidToFormatted: voucher?.validTo
      ? formatZagreb(voucher.validTo, locale)
      : "",
    itemRowsHtml: buildItemRows(items),
    emailItemRowsHtml: buildEmailItemRows(items),
    appDeepLink: buildConfirmationOpenUrl(record.confirmationNumber),
    isCancellation: Boolean(
      input.isCancellation || record.cancelsConfirmationId,
    ),
    cancelledConfirmationNumber: input.cancelledConfirmationNumber || "",
  };
}

async function emailConfirmation(record, input, view) {
  const model = view || buildViewModel(record, input);
  if (!model.documentUrl) {
    model.documentUrl = record.pdfFileUrl || record.htmlFileUrl || "";
  }
  const emailModel = {
    ...model,
    logoSrc: resolveLogoSrc({ forEmail: true }),
  };
  const html = renderPaymentConfirmationEmailHtml(emailModel);
  const hasVoucher = Boolean(record.voucher?.code);
  const locale = resolveLocale(record.locale || model.locale);
  const copy = getCopy(locale);
  const venue = model.organizerVenueName || model.organizerLegalName;
  const amount = ((record.amountCents || 0) / 100).toFixed(2);
  const isCancellation = Boolean(
    model.isCancellation || record.cancelsConfirmationId,
  );
  const subject = isCancellation
    ? copy.subjectCancellation(venue)
    : hasVoucher
      ? copy.subjectWithVoucher(venue)
      : copy.subjectWithoutVoucher(venue, record.currency, amount);

  let pdfBuffer = record.__pdfBuffer;
  let pdfFileName = record.__pdfFileName || `${record.confirmationNumber}.pdf`;
  if (!looksLikePdf(pdfBuffer) && record.pdfFileUrl) {
    try {
      const axios = require("axios");
      const response = await axios.get(record.pdfFileUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      pdfBuffer = Buffer.from(response.data);
    } catch (error) {
      console.warn("[confirmation] could not fetch PDF for email:", error.message);
    }
  }
  if (!looksLikePdf(pdfBuffer)) {
    const unsignedHtml = renderPaymentConfirmationHtml(
      { ...model, logoSrc: resolveLogoSrc({ forEmail: false }) },
      { injectActions: false },
    );
    pdfBuffer = await htmlToPdfBuffer(unsignedHtml);
    pdfFileName = `${record.confirmationNumber}.pdf`;
  }

  const attachments = looksLikePdf(pdfBuffer)
    ? [
        {
          filename: pdfFileName,
          data: pdfBuffer,
          contentType: "application/pdf",
        },
      ]
    : [];

  const inline = [];
  const logo = logoInlineAttachment();
  if (logo && String(emailModel.logoSrc).startsWith("cid:")) {
    inline.push(logo);
  }

  const result = await sendEmailViaMailgun(
    record.customerEmail,
    subject,
    html,
    {
      fromEmail: resolveMailFrom(),
      replyTo: resolvePleisSupportEmail(),
      attachments,
      inline,
      // Surfaced on Mailgun webhooks as user-variables / v: fields.
      variables: {
        confirmationNumber: record.confirmationNumber,
      },
    },
  );

  if (result?.success) {
    record.emailSentAt = new Date();
    record.deliveryStatus = "sent";
    const messageId = result?.data?.id || result?.data?.messageId || null;
    if (messageId) {
      record.emailMessageId = String(messageId).replace(/^<|>$/g, "");
    }
    await record.save();
  }
}

module.exports = {
  generateVoucherCode,
  allocateConfirmationNumber,
  issuePaymentConfirmation,
  issueCancellationConfirmation,
  mapOrderItems,
  mapTicketingItems: require("./helpers").mapTicketingItems,
  humanPaymentMethod,
  displayPercent,
  resolveLocale,
  snapshotCardFromMonriPayload,
  computeHtmlHash,
  computePdfHash,
};
