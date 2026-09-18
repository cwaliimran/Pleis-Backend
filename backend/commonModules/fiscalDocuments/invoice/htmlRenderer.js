const fs = require("fs");
const path = require("path");
const { displayPercent } = require("../../paymentsIntegrations/billko/taxRateLabels");
const {
  toGross,
  buildOrganizerAttributionNote,
} = require("../../paymentsIntegrations/billko/billkoInvoiceBuilder");
const { getCopy, resolveLocale } = require("../locales");
const { formatZagreb, escapeHtml, fillEscapedTokens } = require("../shared/html");
const { resolveLogoSrc } = require("../shared/logo");
const { resolvePleisSupportEmail } = require("../../../config/CONSTANTS");

const TEMPLATE_PATH = path.join(__dirname, "../templates/invoice.html");

function readTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, "utf8");
}

function paymentMethodLabel(paymentType, locale) {
  const copy = getCopy(locale);
  if (paymentType === 1) return copy.cash;
  if (paymentType === 4) return copy.bankTransfer;
  return copy.card;
}

function isPlaceholderBuyerName(firstName, lastName) {
  const joined = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();
  return !joined || joined === "guest" || joined === "guest user";
}

function customerFromBilling(billing = {}, locale, extras = {}) {
  const copy = getCopy(locale).invoicePdf;
  const profileName = String(extras.buyerName || "").trim();
  const joined = [billing.firstName, billing.lastName].filter(Boolean).join(" ").trim();
  const name =
    billing.companyName ||
    profileName ||
    (isPlaceholderBuyerName(billing.firstName, billing.lastName) ? "" : joined) ||
    copy.guest;
  const address = billing.address || {};
  const addressLine = [address.street, address.streetNumber, address.zipCode, address.city]
    .filter(Boolean)
    .join(" ");
  return {
    name,
    email: billing.emailAddress || extras.buyerEmail || "",
    address: addressLine,
  };
}

function buildItemRows(products = [], locale) {
  const itemFallback = getCopy(locale).invoicePdf.item;
  return products
    .map((product) => {
      const qty = Number(product.quantity || 0);
      const unit = toGross(product.unitRetailPrice);
      const amount = toGross(unit * qty);
      const vat = displayPercent(product.taxRateLabels?.[0]);
      const note = String(product.note || "").trim();
      const nameCell = note
        ? `${escapeHtml(product.name || itemFallback)}<div class="item-note">${escapeHtml(note)}</div>`
        : escapeHtml(product.name || itemFallback);
      return `<tr><td class="l">${nameCell}</td><td>${vat == null ? "" : `${vat}%`}</td><td>${qty}</td><td>${unit.toFixed(2)}</td><td>${amount.toFixed(2)}</td></tr>`;
    })
    .join("");
}

function resolveInvoiceNote(invoice, result = {}, extras = {}) {
  const explicit = String(result.note || extras.note || "").trim();
  if (explicit) return explicit;

  const fromProduct = (result.products || extras.products || [])
    .map((product) => String(product.note || "").trim())
    .find(Boolean);
  if (fromProduct) return fromProduct;

  // Organizer ticket invoices must show commercial-agent attribution (Billko §4.3).
  if (invoice?.seller === "organizer" || invoice?.kind === "tickets") {
    return buildOrganizerAttributionNote({
      companyName: extras.sellerLegalName,
      address: extras.sellerAddress,
      oib: extras.sellerOib,
    });
  }
  return "";
}

function fillTokens(html, data) {
  const replacements = { ...data };
  delete replacements.itemRowsHtml;
  html = fillEscapedTokens(html, replacements);
  return html.split("{{ITEM_ROWS}}").join(data.itemRowsHtml || "");
}

function stripDataBlock(html, blockName) {
  const attr = `data-block="${blockName}"`;
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\s)?${attr}[^>]*>[\\s\\S]*?<\\/\\1>`,
    "i",
  );
  return html.replace(re, "");
}

function renderFiscalInvoiceHtml(invoice, extras = {}) {
  const locale = resolveLocale(extras.locale);
  const labels = getCopy(locale).invoicePdf;
  const result = invoice.rawResponse || {};
  const products = result.products || extras.products || [];
  const billing = result.billingInformation || extras.billingInformation || {};
  const customer = customerFromBilling(billing, locale, extras);
  const paymentType = result.payment?.[0]?.paymentType;
  const total = products.reduce(
    (sum, product) =>
      sum + toGross(product.unitRetailPrice) * Number(product.quantity || 0),
    0,
  );
  const issuedAt = formatZagreb(invoice.createdAt || new Date(), locale);
  const footer = labels.footer
    .split("{{ISSUED_AT}}")
    .join(issuedAt)
    .split("{{SUPPORT_EMAIL}}")
    .join(resolvePleisSupportEmail());

  const fiscalProtectionCode =
    invoice.fiscalProtectionCode ||
    result.fiscalProtectionCode ||
    result.zki ||
    result.ZKI ||
    "";

  let html = fillTokens(readTemplate(), {
    HTML_LANG: labels.htmlLang,
    DOC_TITLE: labels.title,
    DOC_TITLE_SECONDARY: labels.titleSecondary,
    PAGE_WORD: labels.pageWord,
    SECTION_DETAILS: labels.details,
    LABEL_INVOICE_NUMBER: labels.invoiceNumber,
    LABEL_FISCALIZATION: labels.fiscalizationNumber,
    LABEL_ZKI: labels.fiscalProtectionCode,
    LABEL_ISSUED_AT: labels.issuedAt,
    LABEL_PAYMENT_METHOD: labels.paymentMethod,
    LABEL_ORDER_REFERENCE: labels.orderReference,
    SECTION_PARTIES: labels.parties,
    ROLE_SELLER: labels.seller,
    ROLE_BUYER: labels.buyer,
    SECTION_ITEMS: labels.items,
    COL_ITEM: labels.item,
    COL_VAT: labels.vat,
    COL_QTY: labels.qty,
    COL_UNIT: labels.unitPrice,
    COL_AMOUNT: labels.amount,
    LABEL_TOTAL: labels.total,
    LBL_ISSUED_BY: labels.issuedBy,
    FOOTER_LINE: footer,
    LOGO_SRC: resolveLogoSrc({ forEmail: false }),
    PLEIS_BRAND: process.env.PLEIS_BRAND || "PLEIS",
    INVOICE_NUMBER: invoice.invoiceNumber || result.invoiceNumber || "",
    FISCALIZATION_NUMBER:
      invoice.fiscalizationNumber || result.fiscalizationNumber || "",
    FISCAL_PROTECTION_CODE: fiscalProtectionCode,
    ISSUED_AT: issuedAt,
    PAYMENT_METHOD: paymentMethodLabel(paymentType, locale),
    ORDER_REFERENCE: invoice.orderNumber || result.orderNumber || "",
    SELLER_LEGAL_NAME: extras.sellerLegalName || "",
    SELLER_ADDRESS: extras.sellerAddress || "",
    SELLER_OIB: extras.sellerOib || "",
    CUSTOMER_NAME: customer.name,
    CUSTOMER_EMAIL: customer.email,
    CUSTOMER_ADDRESS: customer.address,
    CURRENCY: invoice.currency || "EUR",
    TOTAL_AMOUNT: Number(invoice.amount || total || 0).toFixed(2),
    INVOICE_NOTE: resolveInvoiceNote(invoice, result, extras),
    itemRowsHtml: buildItemRows(products, locale),
  });
  if (!fiscalProtectionCode) {
    html = stripDataBlock(html, "zki");
  }
  return html;
}

module.exports = {
  renderFiscalInvoiceHtml,
  buildItemRows,
  resolveInvoiceNote,
  customerFromBilling,
  paymentMethodLabel,
};
