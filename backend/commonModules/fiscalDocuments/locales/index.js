const DEFAULT_LOCALE = "hr";
const LOCALES = {
  en: require("./en"),
  hr: require("./hr"),
};
const SUPPORTED_LOCALES = new Set(Object.keys(LOCALES));

function resolveLocale(value) {
  const raw = String(value || DEFAULT_LOCALE)
    .trim()
    .toLowerCase()
    .replace("_", "-");
  const code = raw.split("-")[0];
  return SUPPORTED_LOCALES.has(code) ? code : DEFAULT_LOCALE;
}

function getCopy(locale) {
  return LOCALES[resolveLocale(locale)];
}

function humanPaymentMethod(method, locale, extras = {}) {
  const copy = getCopy(locale);
  const raw = String(method || "").trim();
  let label = copy.card;
  if (raw === "applePay" || raw === "Apple Pay") label = "Apple Pay";
  else if (raw === "googlePay" || raw === "Google Pay") label = "Google Pay";
  else if (raw === "cash" || raw === "Gotovina" || raw === "Cash") label = copy.cash;

  const brand = extras.cardBrand || extras.brand;
  const last4 = extras.cardLast4 || extras.last4;
  if (label === copy.card && brand && last4) {
    return `${label}, ${brand} ${last4}`;
  }
  if (label === copy.card && last4) {
    return `${label} ${last4}`;
  }
  return label;
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  resolveLocale,
  getCopy,
  humanPaymentMethod,
};
