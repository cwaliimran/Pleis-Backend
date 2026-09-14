const fs = require("fs");
const path = require("path");
const { displayPercent } = require("../../paymentsIntegrations/billko/taxRateLabels");
const { toGross } = require("../../paymentsIntegrations/billko/billkoInvoiceBuilder");
const { getCopy, resolveLocale } = require("../locales");
const { formatZagreb, escapeHtml, fillEscapedTokens } = require("../shared/html");

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

function customerFromBilling(billing = {}, locale) {
  const copy = getCopy(locale).invoicePdf;
  const joined = [billing.firstName, billing.lastName].filter(Boolean).join(" ").trim();
  const name =
    billing.companyName ||
    (isPlaceholderBuyerName(billing.firstName, billing.lastName) ? "" : joined) ||
    copy.guest;
  const address = billing.address || {};
  const addressLine = [address.street, address.streetNumber, address.zipCode, address.city]
    .filter(Boolean)
    .join(" ");
  return {
    name,
    email: billing.emailAddress || "",
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
      return `<tr><td class="l">${escapeHtml(product.name || itemFallback)}</td><td>${vat == null ? "" : `${vat}%`}</td><td>${qty}</td><td>${unit.toFixed(2)}</td><td>${amount.toFixed(2)}</td></tr>`;
    })
    .join("");
}

function fillTokens(html, data) {
  const replacements = { ...data };
  delete replacements.itemRowsHtml;
  html = fillEscapedTokens(html, replacements);
  return html.split("{{ITEM_ROWS}}").join(data.itemRowsHtml || "");
}

function renderFiscalInvoiceHtml(invoice, extras = {}) {
  const locale = resolveLocale(extras.locale);
  const labels = getCopy(locale).invoicePdf;
  const result = invoice.rawResponse || {};
  const products = result.products || extras.products || [];
  const billing = result.billingInformation || extras.billingInformation || {};
  const customer = customerFromBilling(billing, locale);
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
    .join(process.env.PLEIS_SUPPORT_EMAIL || "support@pleis.hr");

  return fillTokens(readTemplate(), {
    HTML_LANG: labels.htmlLang,
    DOC_TITLE: labels.title,
    SECTION_DETAILS: labels.details,
    LABEL_INVOICE_NUMBER: labels.invoiceNumber,
    LABEL_FISCALIZATION: labels.fiscalizationNumber,
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
    FOOTER_LINE: footer,
    INVOICE_NUMBER: invoice.invoiceNumber || result.invoiceNumber || "",
    FISCALIZATION_NUMBER:
      invoice.fiscalizationNumber || result.fiscalizationNumber || "",
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
    INVOICE_NOTE: result.note || extras.note || "",
    itemRowsHtml: buildItemRows(products, locale),
  });
}

module.exports = {
  renderFiscalInvoiceHtml,
  buildItemRows,
  customerFromBilling,
  paymentMethodLabel,
};
