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

/**
 * Prefer an explicit Tg label; fall back to percent→label for legacy rows.
 * Returns null when neither yields a valid Billko label.
 */
function resolveTaxRateLabel({ taxRateLabel, taxPercentage, taxPercent, tax } = {}) {
  if (isValidTaxRateLabel(taxRateLabel)) return taxRateLabel;
  return labelFromPercent(taxPercentage ?? taxPercent ?? tax);
}

function requireTaxRateLabel(fields, context) {
  const label = resolveTaxRateLabel(fields || {});
  if (!label) {
    const error = new Error("billko_unknown_tax_rate_label");
    error.statusCode = 400;
    error.details = { fields, context };
    throw error;
  }
  return label;
}

/**
 * Apply taxRateLabel / taxPercentage onto a ticket (or similar) document.
 * When publishing (active/scheduled), a resolvable label is required.
 */
function applyTicketTaxFields(doc, data = {}) {
  if (!doc) return doc;
  if (data.taxRateLabel !== undefined && data.taxRateLabel !== null && data.taxRateLabel !== "") {
    if (!isValidTaxRateLabel(data.taxRateLabel)) {
      const error = new Error("invalid_tax_rate_label");
      error.statusCode = 400;
      error.details = { taxRateLabel: data.taxRateLabel };
      throw error;
    }
    doc.taxRateLabel = data.taxRateLabel;
    const pct = percentForLabel(data.taxRateLabel);
    if (pct != null) doc.taxPercentage = pct;
  } else if (data.taxPercentage !== undefined) {
    doc.taxPercentage = data.taxPercentage;
    const mapped = labelFromPercent(data.taxPercentage);
    if (mapped) doc.taxRateLabel = mapped;
  }

  const nextStatus =
    data.status !== undefined ? data.status : doc.status;
  if (nextStatus === "active" || nextStatus === "scheduled") {
    if (!isValidTaxRateLabel(doc.taxRateLabel)) {
      // Legacy tickets defaulted taxPercentage to 0 (→ Tg1). Persist label.
      const mapped = labelFromPercent(
        doc.taxPercentage != null ? doc.taxPercentage : 0,
      );
      if (!mapped) {
        const error = new Error("tax_rate_label_required");
        error.statusCode = 400;
        throw error;
      }
      doc.taxRateLabel = mapped;
      if (doc.taxPercentage == null) {
        doc.taxPercentage = percentForLabel(mapped);
      }
    }
  }
  return doc;
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
  resolveTaxRateLabel,
  requireTaxRateLabel,
  applyTicketTaxFields,
};
