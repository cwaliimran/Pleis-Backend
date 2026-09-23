/**
 * Pleis → organizer B2B commission eRačun (Billko §9.3).
 * Seller = Pleis. One invoice per organizer per Fiscalize / off-app batch.
 * Documents retained commission — not a request for payment.
 */

const {
  InvoiceType,
  PaymentType,
  toGross,
  buildCreateInvoicePayload,
  formatBillkoDate,
} = require("../billko/billkoInvoiceBuilder");
const { PLEIS_REVENUE_TAX_LABEL } = require("../billko/taxRateLabels");
const {
  buildOrganizerBillingInformation,
} = require("../../fiscalDocuments/invoice/subscriptionBuilder");

function centsToEur(cents) {
  return toGross((Math.round(Number(cents) || 0) / 100));
}

/**
 * @param {object} input
 * @param {string} input.orderNumber — unique per organizer+run (COMM-…)
 * @param {object} input.user — organizer User lean
 * @param {object} [input.organization]
 * @param {string} input.statementOrBatchRef
 * @param {Array<{ module: string, commissionCents: number, label?: string }>} input.moduleLines
 * @param {Date} [input.dateOfService]
 */
function buildCommissionInvoicePayload(input) {
  const lines = (input.moduleLines || []).filter(
    (line) => Math.round(Number(line.commissionCents) || 0) > 0,
  );
  if (!lines.length) {
    const err = new Error("commission_invoice_empty");
    err.statusCode = 400;
    throw err;
  }

  const products = lines.map((line, index) => {
    const amount = centsToEur(line.commissionCents);
    const module = String(line.module || "ORDERING").toUpperCase();
    return {
      uniqueCode: `COMM-${module}-${String(input.orderNumber).slice(-12)}-${index + 1}`,
      name:
        line.label ||
        `Pleis provizija — ${module.toLowerCase()} (${input.statementOrBatchRef})`,
      type: 1,
      quantity: 1,
      unitRetailPrice: amount,
      taxRateLabels: [PLEIS_REVENUE_TAX_LABEL],
    };
  });

  return buildCreateInvoicePayload({
    orderNumber: String(input.orderNumber),
    products,
    paymentType: PaymentType.Other,
    billingInformation: buildOrganizerBillingInformation(
      input.user,
      input.organization,
    ),
    invoiceType: InvoiceType.Electronic,
    createOrUpdateOrganizationCustomer: true,
    dateOfService: input.dateOfService
      ? formatBillkoDate(input.dateOfService)
      : undefined,
    note: `Commission eRačun for ${input.statementOrBatchRef}. Already deducted at payout — documentation only. Fiskalizacija 2.0 B2B.`,
  });
}

const { isBillkoFiscalizeEnabled } = require("../billko/billkoClient");

module.exports = {
  buildCommissionInvoicePayload,
  isBillkoFiscalizeEnabled,
  centsToEur,
};
