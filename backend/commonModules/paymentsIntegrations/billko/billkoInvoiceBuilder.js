const moment = require("moment-timezone");
const { getCallbackUrl } = require("./billkoClient");
const {
  PLEIS_REVENUE_TAX_LABEL,
  VOUCHER_TAX_LABEL,
  isValidTaxRateLabel,
} = require("./taxRateLabels");

const BILLKO_TZ = "Europe/Zagreb";

const InvoiceFormat = { A4Paper: 3 };
const InvoiceType = { Normal: 0 };
const TransactionType = { Sale: 0, Refund: 1 };
const ProductType = { Service: 1, Ticket: 4 };
const PaymentType = {
  Other: 0,
  Cash: 1,
  Card: 2,
  Check: 3,
  WireTransfer: 4,
  Voucher: 5,
};
const BillingType = { Person: 1, Company: 2 };

function toGross(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatBillkoDate(date = new Date()) {
  return moment(date).tz(BILLKO_TZ).format("DD.MM.YYYYTHH:mm:ss");
}

function splitStreet(fullAddress = "") {
  const trimmed = String(fullAddress || "").trim();
  const match = trimmed.match(/^(.*?)[\s,]+(\d+[a-zA-Z0-9/-]*)$/);
  if (match) {
    return { street: match[1].trim() || "Address", streetNumber: match[2] };
  }
  return { street: trimmed || "Address", streetNumber: "1" };
}

function countryCode(country) {
  if (!country) return "hr";
  const value = String(country).trim();
  if (value.toUpperCase() === "USA") return "us";
  if (value.length === 2) return value.toLowerCase();
  const map = {
    croatia: "hr",
    hrvatska: "hr",
    germany: "de",
    austria: "at",
    slovenia: "si",
    italy: "it",
  };
  return map[value.toLowerCase()] || "hr";
}

function mapGatewayPaymentType(paymentMethod) {
  if (paymentMethod === "cash") return PaymentType.Cash;
  return PaymentType.Card;
}

function buildBillingInformation(billing, fallback = {}) {
  const address = billing?.billingAddress || {};
  const { street, streetNumber } = splitStreet(address.address || fallback.address || "");
  const isCompany =
    billing?.type === "company" ||
    billing?.type === 2 ||
    Boolean(billing?.companyName && billing?.personalIdentificationNumber);

  const payload = {
    type: isCompany ? BillingType.Company : BillingType.Person,
    emailAddress: billing?.email || fallback.email || "",
    address: {
      street,
      streetNumber,
      city: address.city || fallback.city || "",
      zipCode: address.postalCode || fallback.postalCode || "",
      countryCode: countryCode(address.country || fallback.country),
    },
  };

  if (isCompany) {
    payload.companyName = billing.companyName;
    payload.personalIdentificationNumber = billing.personalIdentificationNumber;
  } else {
    payload.firstName = billing?.firstName || fallback.firstName || "Guest";
    payload.lastName = billing?.lastName || fallback.lastName || "User";
  }

  if (billing?.phone) payload.phoneNumber = billing.phone;
  return payload;
}

function productTotal(products) {
  return toGross(
    products.reduce(
      (sum, product) => sum + toGross(product.unitRetailPrice) * Number(product.quantity || 0),
      0,
    ),
  );
}

function buildCreateInvoicePayload({
  orderNumber,
  products,
  paymentType,
  billingInformation,
  dateOfService,
  note,
  createOrUpdateOrganizationCustomer = false,
}) {
  const total = productTotal(products);
  if (products.some((product) => !isValidTaxRateLabel(product.taxRateLabels?.[0]))) {
    const error = new Error("billko_unknown_tax_rate_label");
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    invoiceFormat: InvoiceFormat.A4Paper,
    fiscalizeInvoice: true,
    type: InvoiceType.Normal,
    transactionType: TransactionType.Sale,
    orderNumber: String(orderNumber),
    payment: [{ amount: total, paymentType }],
    products,
    billingInformation,
    returnUrl: getCallbackUrl(),
  };

  if (dateOfService) payload.dateOfService = formatBillkoDate(dateOfService);
  if (note) payload.note = note;
  if (createOrUpdateOrganizationCustomer) {
    payload.createOrUpdateOrganizationCustomer = true;
  }

  return payload;
}

function buildServiceFeeProducts(ticketLines, feeTotal) {
  const totalQty = ticketLines.reduce((sum, line) => sum + line.quantity, 0) || 1;
  const unit = toGross(feeTotal / totalQty);
  let allocated = 0;
  return ticketLines.map((line, index) => {
    let unitPrice = unit;
    if (index === ticketLines.length - 1) {
      unitPrice = toGross((toGross(feeTotal) - allocated) / line.quantity);
    }
    allocated = toGross(allocated + unitPrice * line.quantity);
    return {
      uniqueCode: `FEE-${String(line.uniqueCode || line.ticketId).replace(/^TCK-/, "")}`,
      name: `Service fee — ${line.name}`,
      type: ProductType.Service,
      quantity: line.quantity,
      unitRetailPrice: unitPrice,
      taxRateLabels: [PLEIS_REVENUE_TAX_LABEL],
    };
  });
}

function buildTicketProducts(ticketLines, organizerAttributionNote) {
  return ticketLines.map((line) => ({
    uniqueCode: line.uniqueCode,
    name: line.name,
    type: ProductType.Ticket,
    quantity: line.quantity,
    unitRetailPrice: toGross(line.unitRetailPrice),
    taxRateLabels: [line.taxRateLabel],
    note: organizerAttributionNote,
  }));
}

function buildServiceProducts(lines, organizerAttributionNote) {
  return lines.map((line) => ({
    uniqueCode: line.uniqueCode,
    name: line.name,
    type: ProductType.Service,
    quantity: line.quantity,
    unitRetailPrice: toGross(line.unitRetailPrice),
    taxRateLabels: [line.taxRateLabel],
    ...(organizerAttributionNote ? { note: organizerAttributionNote } : {}),
  }));
}

function scaleLinesToGross(lines, targetGross) {
  const current = productTotal(lines);
  const target = toGross(targetGross);
  if (!lines.length || current <= 0 || target <= 0 || current === target) {
    return lines;
  }
  let allocated = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) {
      const remaining = toGross(target - allocated);
      const unitRetailPrice = toGross(remaining / line.quantity);
      return { ...line, unitRetailPrice };
    }
    const share = (toGross(line.unitRetailPrice) * line.quantity) / current;
    const lineTotal = toGross(target * share);
    const unitRetailPrice = toGross(lineTotal / line.quantity);
    allocated = toGross(allocated + unitRetailPrice * line.quantity);
    return { ...line, unitRetailPrice };
  });
}

function buildOrganizerAttributionNote(organizer) {
  const parts = [
    organizer?.companyName,
    organizer?.address,
    organizer?.oib ? `OIB ${organizer.oib}` : null,
  ].filter(Boolean);
  return `Stavka zaračunata u ime i za račun Organizatora: ${parts.join(", ")}.`;
}

module.exports = {
  BILLKO_TZ,
  InvoiceFormat,
  InvoiceType,
  TransactionType,
  ProductType,
  PaymentType,
  BillingType,
  toGross,
  formatBillkoDate,
  splitStreet,
  countryCode,
  mapGatewayPaymentType,
  buildBillingInformation,
  productTotal,
  buildCreateInvoicePayload,
  buildServiceFeeProducts,
  buildTicketProducts,
  buildServiceProducts,
  scaleLinesToGross,
  buildOrganizerAttributionNote,
  PLEIS_REVENUE_TAX_LABEL,
  VOUCHER_TAX_LABEL,
};
