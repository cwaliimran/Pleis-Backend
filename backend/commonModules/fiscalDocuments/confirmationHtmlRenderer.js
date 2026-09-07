const fs = require("fs");
const path = require("path");
const {
  resolveLocale,
  getCopy,
  localizeDocumentTemplate,
  localizeEmailTemplate,
} = require("./confirmationI18n");

const TEMPLATE_DIR = path.join(__dirname, "templates");
const DOCUMENT_TEMPLATE = path.join(
  TEMPLATE_DIR,
  "payment_confirmation_template.html",
);
const EMAIL_TEMPLATE = path.join(
  TEMPLATE_DIR,
  "payment_confirmation_email.html",
);

const templateCache = new Map();

function readTemplate(filePath) {
  if (!templateCache.has(filePath)) {
    templateCache.set(filePath, fs.readFileSync(filePath, "utf8"));
  }
  return templateCache.get(filePath);
}

function formatZagreb(date, locale = "en") {
  if (!date) return "";
  const intlLocale = resolveLocale(locale) === "hr" ? "hr-HR" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMoney(amount, currency = "EUR") {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flattenTokens(data) {
  return {
    PLEIS_LEGAL_NAME: data.pleisLegalName,
    PLEIS_OIB: data.pleisOib,
    PLEIS_ADDRESS: data.pleisAddress,
    PLEIS_BRAND: data.pleisBrand,
    PLEIS_WEB: data.pleisWeb,
    SUPPORT_EMAIL: data.supportEmail,
    CONFIRMATION_NUMBER: data.confirmationNumber,
    ISSUED_AT: data.issuedAtFormatted,
    DOCUMENT_HASH: data.documentHash,
    CUSTOMER_NAME: data.customerName,
    CUSTOMER_EMAIL: data.customerEmail,
    CUSTOMER_FIRST_NAME: data.customerFirstName,
    TRANSACTION_ID: data.transactionId,
    ORDER_REFERENCE: data.orderReference,
    PAID_AT: data.paidAtFormatted,
    PAYMENT_METHOD: data.paymentMethod,
    CURRENCY: data.currency,
    TOTAL_AMOUNT: Number(data.totalAmount || 0).toFixed(2),
    ORGANIZER_LEGAL_NAME: data.organizerLegalName,
    ORGANIZER_VENUE_NAME: data.organizerVenueName,
    ORGANIZER_ADDRESS: data.organizerAddress,
    ORGANIZER_OIB: data.organizerOib,
    VOUCHER_AMOUNT:
      data.voucher?.amount != null ? Number(data.voucher.amount).toFixed(2) : "",
    VOUCHER_CODE: data.voucher?.code || "",
    VOUCHER_VALID_FROM: data.voucherValidFromFormatted || "",
    VOUCHER_VALID_TO: data.voucherValidToFormatted || "",
    APP_DEEPLINK: data.appDeepLink || "https://pleis.hr",
    APP_DEEP_LINK: data.appDeepLink || "https://pleis.hr",
    DOCUMENT_URL: data.documentUrl || "",
  };
}

function fillTokens(html, data, itemRowsHtml) {
  const replacements = flattenTokens(data);
  Object.entries(replacements).forEach(([token, value]) => {
    html = html.split(`{{${token}}}`).join(escapeHtml(value == null ? "" : String(value)));
  });
  html = html.split("{{ITEM_ROWS}}").join(itemRowsHtml || "");
  return html;
}

function findMatchingCloseTag(html, start, tag) {
  const openPat = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const closePat = new RegExp(`</${tag}>`, "i");
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const slice = html.slice(i);
    const openMatch = slice.match(openPat);
    const closeMatch = slice.match(closePat);
    const openAt = openMatch ? slice.indexOf(openMatch[0]) : -1;
    const closeAt = closeMatch ? slice.indexOf(closeMatch[0]) : -1;
    if (closeAt < 0) return -1;
    if (openAt >= 0 && openAt < closeAt) {
      depth += 1;
      i += openAt + openMatch[0].length;
    } else {
      depth -= 1;
      i += closeAt + closeMatch[0].length;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripDataBlock(html, blockName) {
  const attr = `data-block="${blockName}"`;
  let result = html;
  while (result.includes(attr)) {
    const attrIndex = result.indexOf(attr);
    const start = result.lastIndexOf("<", attrIndex);
    const tagMatch = result.slice(start).match(/^<(div|tr)\b/i);
    if (!tagMatch) break;
    const end = findMatchingCloseTag(result, start, tagMatch[1]);
    if (end < 0) break;
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

const ACTION_BTN_STYLE =
  "display:inline-block;background:#D0E4FF;color:#10368A;border:none;padding:8px 14px;" +
  "border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;cursor:pointer;" +
  "font-family:'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.2;";

function buildActionsBar({ locale, filename, documentUrl }) {
  const copy = getCopy(locale);
  const printLabel = escapeHtml(copy.print);
  const downloadLabel = escapeHtml(copy.download);
  const safeName = escapeHtml(filename);
  const safeUrl = documentUrl ? escapeHtml(documentUrl) : "";

  const printControl = safeUrl
    ? `<a href="${safeUrl}" target="_blank" rel="noopener" style="${ACTION_BTN_STYLE}">${printLabel}</a>`
    : `<button type="button" onclick="window.print()" style="${ACTION_BTN_STYLE}">${printLabel}</button>`;

  const downloadControl = safeUrl
    ? `<a href="${safeUrl}" download="${safeName}" style="${ACTION_BTN_STYLE}">${downloadLabel}</a>`
    : `<button type="button" onclick="window.__pleisDownloadHtml()" style="${ACTION_BTN_STYLE}">${downloadLabel}</button>`;

  return `<style>
@media print { .pleis-doc-actions { display: none !important; } }
</style>
<div class="pleis-doc-actions" style="position:sticky;top:0;z-index:9999;display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:10px 16px;background:#10368A;">
  ${printControl}
  ${downloadControl}
</div>
<script>
window.__pleisDownloadHtml = function () {
  var blob = new Blob([document.documentElement.outerHTML], { type: "text/html;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(filename)};
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};
</script>`;
}

function injectActionsBar(html, options) {
  const bar = buildActionsBar(options);
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>\n${bar}`);
  }
  return bar + html;
}

function applyTemplate(html, data, { itemRowsHtml, hasVoucher, filename, documentUrl }) {
  html = fillTokens(html, data, itemRowsHtml);
  if (!hasVoucher) {
    html = stripDataBlock(html, "voucher");
  }
  return injectActionsBar(html, {
    locale: data.locale,
    filename: filename || `${data.confirmationNumber || "confirmation"}.html`,
    documentUrl,
  });
}

function renderPaymentConfirmationHtml(data) {
  const locale = resolveLocale(data.locale);
  let html = localizeDocumentTemplate(readTemplate(DOCUMENT_TEMPLATE), locale);
  return applyTemplate(html, data, {
    itemRowsHtml: data.itemRowsHtml,
    hasVoucher: Boolean(data.voucher?.code),
    filename: `${data.confirmationNumber || "confirmation"}.html`,
  });
}

function renderPaymentConfirmationEmailHtml(data) {
  const locale = resolveLocale(data.locale);
  let html = localizeEmailTemplate(readTemplate(EMAIL_TEMPLATE), locale);
  return applyTemplate(html, data, {
    itemRowsHtml: data.emailItemRowsHtml,
    hasVoucher: Boolean(data.voucher?.code),
    filename: `${data.confirmationNumber || "confirmation"}.html`,
    documentUrl: data.documentUrl,
  });
}

module.exports = {
  renderPaymentConfirmationHtml,
  renderPaymentConfirmationEmailHtml,
  formatZagreb,
  formatMoney,
  escapeHtml,
};
