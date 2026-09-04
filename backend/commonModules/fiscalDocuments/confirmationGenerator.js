const crypto = require("crypto");
const moment = require("moment-timezone");
const { customAlphabet } = require("nanoid");
const PaymentConfirmation = require("./PaymentConfirmation.model");
const PaymentConfirmationSequence = require("./PaymentConfirmationSequence.model");
const {
  renderPaymentConfirmationHtml,
  renderPaymentConfirmationEmailHtml,
  formatZagreb,
  escapeHtml,
} = require("./pdfRenderer");
const { displayPercent } = require("../paymentsIntegrations/billko/taxRateLabels");
const {
  DEFAULT_LOCALE,
  resolveLocale,
  getCopy,
  humanPaymentMethod,
} = require("./confirmationI18n");
const { uploadFilesToAzure } = require("../../controllers/uploadAzureController");
const { sendEmailViaMailgun } = require("../../helperUtils/emailUtil");

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
    pleisWeb: process.env.PLEIS_WEB || "https://pleis.hr",
    supportEmail: process.env.PLEIS_SUPPORT_EMAIL || "support@pleis.hr",
  };
}

function buildItemRows(items) {
  return items
    .map((item) => {
      const vat = item.vatPercent == null ? "" : `${item.vatPercent}%`;
      const indentClass = item.isOption ? ' class="opt"' : "";
      return `<tr${indentClass}><td class="l">${escapeHtml(item.name)}</td><td>${vat}</td><td>${item.quantity}</td><td>${Number(item.unitPrice).toFixed(2)}</td><td>${Number(item.amount).toFixed(2)}</td></tr>`;
    })
    .join("");
}

function buildEmailItemRows(items) {
  return items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;font-size:13px;color:#14181F;">${escapeHtml(item.name)} × ${item.quantity}</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#14181F;">${Number(item.amount).toFixed(2)}</td></tr>`,
    )
    .join("");
}

async function issuePaymentConfirmation(input) {
  const existing = await PaymentConfirmation.findOne({
    orderId: input.orderId,
    module: input.module,
  });
  if (existing) {
    if (!existing.htmlStorageKey) {
      return regenerateAndStore(existing, input);
    }
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

  const record = await PaymentConfirmation.create({
    confirmationNumber,
    transactionId: input.transactionId,
    orderReference: input.orderReference,
    orderId: input.orderId,
    module: input.module,
    organizerCompanyId: input.organizerCompanyId,
    organization: input.organization,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod || "card",
    amountCents,
    currency: input.currency || "EUR",
    items,
    voucherId: input.voucher?.code || null,
    voucher: input.voucher || undefined,
    status: "ISSUED",
    issuedAt,
    locale,
  });

  return regenerateAndStore(record, input);
}

function computeDocumentHash(view) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        confirmationNumber: view.confirmationNumber,
        transactionId: view.transactionId,
        orderReference: view.orderReference,
        paidAt: view.paidAt,
        amount: view.totalAmount,
        currency: view.currency,
        items: view.items,
        voucher: view.voucher?.code || null,
        customerEmail: view.customerEmail,
      }),
    )
    .digest("hex");
}

async function regenerateAndStore(record, input) {
  const view = buildViewModel(record, input);
  view.documentHash = computeDocumentHash(view);
  const documentHtml = renderPaymentConfirmationHtml(view);
  const htmlBuffer = Buffer.from(documentHtml, "utf8");
  const filename = `${record.confirmationNumber}.html`;

  const uploaded = await uploadFilesToAzure([
    {
      buffer: htmlBuffer,
      originalname: filename,
      mimetype: "text/html",
    },
  ]);
  const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

  record.documentHash = view.documentHash;
  record.htmlStorageKey = file?.file || "";
  record.htmlFileUrl = file?.fileUrl || "";
  record.pdfStorageKey = "";
  record.pdfFileUrl = record.htmlFileUrl;
  await record.save();

  view.documentUrl = record.htmlFileUrl;
  await emailConfirmation(record, input, htmlBuffer, view);
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
    paymentMethod: humanPaymentMethod(record.paymentMethod, locale),
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
    appDeepLink: process.env.PLEIS_APP_DEEP_LINK || "https://pleis.hr",
  };
}

async function emailConfirmation(record, input, htmlBuffer, view) {
  const model = view || buildViewModel(record, input);
  if (!model.documentUrl) {
    model.documentUrl = record.htmlFileUrl || record.pdfFileUrl || "";
  }
  const html = renderPaymentConfirmationEmailHtml(model);
  const attachmentBuffer =
    htmlBuffer || Buffer.from(renderPaymentConfirmationHtml(model), "utf8");
  const hasVoucher = Boolean(record.voucher?.code);
  const locale = resolveLocale(record.locale || model.locale);
  const copy = getCopy(locale);
  const venue = model.organizerVenueName || model.organizerLegalName;
  const amount = ((record.amountCents || 0) / 100).toFixed(2);
  const subject = hasVoucher
    ? copy.subjectWithVoucher(venue)
    : copy.subjectWithoutVoucher(venue, record.currency, amount);

  const attachments = [];
  if (attachmentBuffer) {
    attachments.push({
      filename: `${record.confirmationNumber}.html`,
      data: attachmentBuffer,
      contentType: "text/html",
    });
  }

  const result = await sendEmailViaMailgun(
    record.customerEmail,
    subject,
    html,
    {
      fromEmail: `Pleis <noreply@${process.env.MAILGUN_DOMAIN || "pleis.ai"}>`,
      replyTo: process.env.PLEIS_SUPPORT_EMAIL || "support@pleis.hr",
      attachments,
    },
  );

  if (result?.success) {
    record.emailSentAt = new Date();
    await record.save();
  }
}

function mapOrderItems(order, locale) {
  const copy = getCopy(locale);
  const rows = [];
  for (const item of order.items || []) {
    const snapshot = item.menuItemSnapShot || {};
    rows.push({
      name: snapshot.title || copy.item,
      vatPercent: displayPercent(snapshot.taxPercent ?? snapshot.taxPercentage),
      quantity: item.quantity,
      unitPrice: item.unitFinalPrice ?? item.unitPrice ?? 0,
      amount: item.finalPrice ?? 0,
    });
  }
  if (order.priceBreakdown?.tip) {
    rows.push({
      name: copy.tip,
      vatPercent: 0,
      quantity: 1,
      unitPrice: order.priceBreakdown.tip,
      amount: order.priceBreakdown.tip,
    });
  }
  return rows;
}

module.exports = {
  generateVoucherCode,
  allocateConfirmationNumber,
  issuePaymentConfirmation,
  mapOrderItems,
  humanPaymentMethod,
  displayPercent,
  resolveLocale,
};
