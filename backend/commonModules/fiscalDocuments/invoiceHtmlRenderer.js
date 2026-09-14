const fs = require("fs");
const path = require("path");
const { formatZagreb, escapeHtml } = require("./confirmationHtmlRenderer");
const { displayPercent } = require("../paymentsIntegrations/billko/taxRateLabels");
const { toGross } = require("../paymentsIntegrations/billko/billkoInvoiceBuilder");

const TEMPLATE_PATH = path.join(
  __dirname,
  "templates",
  "fiscal_invoice_template.html",
);

function readTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, "utf8");
}

function paymentMethodLabel(paymentType) {
  if (paymentType === 1) return "Gotovina";
  if (paymentType === 2) return "Kartica";
  if (paymentType === 4) return "Virman";
  return "Kartica";
}

function customerFromBilling(billing = {}) {
  const name =
    billing.companyName ||
    [billing.firstName, billing.lastName].filter(Boolean).join(" ") ||
    "Kupac";
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

function buildItemRows(products = []) {
  return products
    .map((product) => {
      const qty = Number(product.quantity || 0);
      const unit = toGross(product.unitRetailPrice);
      const amount = toGross(unit * qty);
      const vat = displayPercent(product.taxRateLabels?.[0]);
      return `<tr><td class="l">${escapeHtml(product.name || "Stavka")}</td><td>${vat == null ? "" : `${vat}%`}</td><td>${qty}</td><td>${unit.toFixed(2)}</td><td>${amount.toFixed(2)}</td></tr>`;
    })
    .join("");
}

function fillTokens(html, data) {
  const replacements = {
    INVOICE_NUMBER: data.invoiceNumber,
    FISCALIZATION_NUMBER: data.fiscalizationNumber,
    ISSUED_AT: data.issuedAt,
    PAYMENT_METHOD: data.paymentMethod,
    ORDER_REFERENCE: data.orderReference,
    SELLER_LEGAL_NAME: data.sellerLegalName,
    SELLER_ADDRESS: data.sellerAddress,
    SELLER_OIB: data.sellerOib,
    CUSTOMER_NAME: data.customerName,
    CUSTOMER_EMAIL: data.customerEmail,
    CUSTOMER_ADDRESS: data.customerAddress,
    CURRENCY: data.currency,
    TOTAL_AMOUNT: Number(data.totalAmount || 0).toFixed(2),
    INVOICE_NOTE: data.note || "",
    SUPPORT_EMAIL: data.supportEmail,
  };
  Object.entries(replacements).forEach(([token, value]) => {
    html = html.split(`{{${token}}}`).join(escapeHtml(value == null ? "" : String(value)));
  });
  return html.split("{{ITEM_ROWS}}").join(data.itemRowsHtml || "");
}

function renderFiscalInvoiceHtml(invoice, extras = {}) {
  const result = invoice.rawResponse || {};
  const products = result.products || extras.products || [];
  const billing = result.billingInformation || extras.billingInformation || {};
  const customer = customerFromBilling(billing);
  const paymentType = result.payment?.[0]?.paymentType;
  const total = products.reduce(
    (sum, product) =>
      sum + toGross(product.unitRetailPrice) * Number(product.quantity || 0),
    0,
  );
  const html = fillTokens(readTemplate(), {
    invoiceNumber: invoice.invoiceNumber || result.invoiceNumber || "",
    fiscalizationNumber:
      invoice.fiscalizationNumber || result.fiscalizationNumber || "",
    issuedAt: formatZagreb(invoice.createdAt || new Date(), "hr"),
    paymentMethod: paymentMethodLabel(paymentType),
    orderReference: invoice.orderNumber || result.orderNumber || "",
    sellerLegalName: extras.sellerLegalName || "",
    sellerAddress: extras.sellerAddress || "",
    sellerOib: extras.sellerOib || "",
    customerName: customer.name,
    customerEmail: customer.email,
    customerAddress: customer.address,
    currency: invoice.currency || "EUR",
    totalAmount: invoice.amount || total,
    note: result.note || extras.note || "",
    supportEmail: process.env.PLEIS_SUPPORT_EMAIL || "support@pleis.hr",
    itemRowsHtml: buildItemRows(products),
  });
  return html;
}

module.exports = {
  renderFiscalInvoiceHtml,
  buildItemRows,
  customerFromBilling,
  paymentMethodLabel,
};
