const TAX_RATE_LABELS = ["Tg0", "Tg1", "Tg2", "Tg3", "Tg4"];

const TAX_RATE_PERCENT = {
  Tg0: 0,
  Tg1: 0,
  Tg2: 5,
  Tg3: 13,
  Tg4: 25,
};

const PERCENT_TO_LABEL = {
  0: "Tg1",
  5: "Tg2",
  13: "Tg3",
  25: "Tg4",
};

const PLEIS_REVENUE_TAX_LABEL = "Tg4";
const VOUCHER_TAX_LABEL = "Tg1";
const TIP_TAX_LABEL = "Tg1";

function isValidTaxRateLabel(label) {
  return TAX_RATE_LABELS.includes(label);
}

function percentForLabel(label) {
  if (!isValidTaxRateLabel(label)) return null;
  return TAX_RATE_PERCENT[label];
}

function normalizeTaxPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // Accept both 25 and 0.25
  const percent = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(percent);
}

/**
 * Map the numeric tax already stored on tickets / menu items / reservations
 * to the Billko label required on create-invoice.
 * 0 → Tg1 (0% VAT). Tg0 (outside VAT) cannot be inferred from a number.
 */
function labelFromPercent(value) {
  const percent = normalizeTaxPercent(value);
  if (percent == null) return null;
  return PERCENT_TO_LABEL[percent] || null;
}

function displayPercent(valueOrLabel) {
  if (isValidTaxRateLabel(valueOrLabel)) {
    return TAX_RATE_PERCENT[valueOrLabel];
  }
  const percent = normalizeTaxPercent(valueOrLabel);
  return percent == null ? 0 : percent;
}

function requireLabelFromPercent(value, context) {
  const label = labelFromPercent(value);
  if (!label) {
    const error = new Error("billko_unknown_tax_rate");
    error.statusCode = 400;
    error.details = { value, context };
    throw error;
  }
  return label;
}

module.exports = {
  TAX_RATE_LABELS,
  TAX_RATE_PERCENT,
  PERCENT_TO_LABEL,
  PLEIS_REVENUE_TAX_LABEL,
  VOUCHER_TAX_LABEL,
  TIP_TAX_LABEL,
  isValidTaxRateLabel,
  percentForLabel,
  normalizeTaxPercent,
  labelFromPercent,
  displayPercent,
  requireLabelFromPercent,
};
