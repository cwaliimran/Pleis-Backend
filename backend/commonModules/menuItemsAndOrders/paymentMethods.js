/**
 * Ordering payment methods (Requirement Set #68; Legal_req_features_2 §1;
 * order-settings prototype v2.3; app-menu-order prototype v2.7).
 *
 * The guest picks how to pay on the order confirmation screen:
 *   Pay over Pleis  (Monri):            card, applePay, googlePay   → shown as "Pleis Payment"
 *   Pay outside Pleis (at the venue):   cash, cardTerminal, other
 *   A voucher covering the whole order: voucher (no method selector)
 *
 * paymentMethod stores the method. paymentMethodLabel stores the value that must
 * be identical on the transaction record, confirmation document, admin order
 * detail, staff app and exports ("Card", "Other - Voucher",
 * "Other - Voucher + Cash" …). Organizers see one of four values: Pleis, Card,
 * Cash, Other.
 */

const PLEIS_METHODS = Object.freeze(["card", "applePay", "googlePay"]);
const OFF_APP_METHODS = Object.freeze(["cash", "cardTerminal", "other"]);
const VOUCHER_METHOD = "voucher";
const ORDER_PAYMENT_METHODS = Object.freeze([...PLEIS_METHODS, ...OFF_APP_METHODS, VOUCHER_METHOD]);

const METHOD_LABEL = Object.freeze({
  card: "Card",
  applePay: "Apple Pay",
  googlePay: "Google Pay",
  cash: "Cash",
  cardTerminal: "Card (venue terminal)",
  other: "Other",
  voucher: "Other - Voucher",
});

/** Venue setting (Setting.paymentMethod) that enables each method. */
const METHOD_SETTING = Object.freeze({
  card: "inAppPayment",
  applePay: "inAppPayment",
  googlePay: "inAppPayment",
  cash: "cash",
  cardTerminal: "card",
  other: "other",
});

const isPleisMethod = (method) => PLEIS_METHODS.includes(method);
const isOffAppMethod = (method) => OFF_APP_METHODS.includes(method);

/** Recorded value: method name, or the composite voucher form. */
const buildPaymentMethodLabel = ({ paymentMethod, voucherAmount = 0 }) => {
  if (paymentMethod === VOUCHER_METHOD) return METHOD_LABEL.voucher;
  const base = METHOD_LABEL[paymentMethod] || paymentMethod || "";
  return Number(voucherAmount) > 0 ? `${METHOD_LABEL.voucher} + ${base}` : base;
};

/** The four values organizers see (Legal_req_features_2 §1). */
const organizerPaymentMethod = (paymentMethod) => {
  if (isPleisMethod(paymentMethod)) return "Pleis";
  if (paymentMethod === "cash") return "Cash";
  if (paymentMethod === "cardTerminal") return "Card";
  if (paymentMethod === "other" || paymentMethod === VOUCHER_METHOD) return "Other";
  return null;
};

/** Methods the venue currently allows (at least one is always enabled). */
const enabledMethodsFor = (setting) => {
  const methods = setting?.paymentMethod || {};
  return ORDER_PAYMENT_METHODS.filter(
    (m) => m !== VOUCHER_METHOD && methods[METHOD_SETTING[m]] === true,
  );
};

module.exports = {
  PLEIS_METHODS,
  OFF_APP_METHODS,
  VOUCHER_METHOD,
  ORDER_PAYMENT_METHODS,
  METHOD_LABEL,
  METHOD_SETTING,
  isPleisMethod,
  isOffAppMethod,
  buildPaymentMethodLabel,
  organizerPaymentMethod,
  enabledMethodsFor,
};
