const {
  InvoiceType,
  PaymentType,
  BillingType,
  toGross,
  buildCreateInvoicePayload,
  splitStreet,
  countryCode,
} = require("../paymentsIntegrations/billko/billkoInvoiceBuilder");
const { PLEIS_REVENUE_TAX_LABEL } = require("../paymentsIntegrations/billko/taxRateLabels");

function buildOrganizerBillingInformation(user, organization) {
  const details = user?.companyDetails || {};
  const location = details.location || organization?.location || {};
  const { street, streetNumber } = splitStreet(
    location.fullAddress || details.address || organization?.basicInfo?.address || "",
  );
  const name = details.name || organization?.basicInfo?.name || "";
  const [firstName, ...rest] = String(
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Organizer",
  ).split(" ");

  const payload = {
    type: name ? BillingType.Company : BillingType.Person,
    emailAddress: user?.email || "",
    address: {
      street,
      streetNumber,
      city: location.city || "",
      zipCode: location.postalCode || "",
      countryCode: countryCode(location.country),
    },
  };

  if (name) {
    payload.companyName = name;
    payload.personalIdentificationNumber = details.oib || details.personalIdentificationNumber || "";
  } else {
    payload.firstName = firstName || "Organizer";
    payload.lastName = rest.join(" ") || "User";
  }

  return payload;
}

function buildSubscriptionInvoicePayload({ transaction, user, organization }) {
  const types = Array.isArray(transaction.subscriptionTypes)
    ? transaction.subscriptionTypes
    : [];
  const amount = toGross(transaction.amount || 0);
  const products = [
    {
      uniqueCode: `SUB-${transaction.orderNumber}`,
      name: types.length
        ? `Pretplata: ${types.join(", ")}`
        : "Pretplata PLEIS",
      type: 1,
      quantity: 1,
      unitRetailPrice: amount,
      taxRateLabels: [PLEIS_REVENUE_TAX_LABEL],
    },
  ];

  return buildCreateInvoicePayload({
    orderNumber: transaction.orderNumber,
    products,
    paymentType:
      transaction.paymentMethod === "cash" ? PaymentType.Cash : PaymentType.Card,
    billingInformation: buildOrganizerBillingInformation(user, organization),
    invoiceType: InvoiceType.Electronic,
    createOrUpdateOrganizationCustomer: true,
    note: "eRačun za pretplatu organizatora. Extra e-invoice fields beyond Tg4 type-2 are unspecified (Billko §15).",
  });
}

module.exports = {
  buildSubscriptionInvoicePayload,
  buildOrganizerBillingInformation,
};
