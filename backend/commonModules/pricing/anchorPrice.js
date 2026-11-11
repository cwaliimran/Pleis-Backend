/**
 * Anchor price (PLEIS Legal spec section 2 — legal requirement from 1 October).
 *
 * Optional reference price entered by the organizer on menu items, tickets and
 * reservations, shown in the app below the current price as "20,00 € (10.09.2026.)".
 *   anchorPrice      decimal EUR, optional
 *   anchorPriceDate  date, required when anchorPrice is set (and vice versa)
 * Stored as a UTC-midnight Date; clients format it in UTC.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const isBlank = (v) => v === undefined || v === null || v === "";

/** Parse "YYYY-MM-DD" (or an ISO string / Date) to a UTC-midnight Date; null if invalid. */
const toAnchorDate = (v) => {
  if (isBlank(v)) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const s = String(v).trim();
  const d = DATE_ONLY.test(s) ? new Date(`${s}T00:00:00.000Z`) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/**
 * Validate + normalise an incoming pair. Only touches what the request sends.
 * Returns { error } (translation key) or { values } to merge into the update.
 * `existing` = current document values (for partial updates).
 */
const parseAnchorPriceInput = (body = {}, existing = {}) => {
  const hasPrice = Object.prototype.hasOwnProperty.call(body, "anchorPrice");
  const hasDate = Object.prototype.hasOwnProperty.call(body, "anchorPriceDate");
  if (!hasPrice && !hasDate) return { values: {} };

  let price = hasPrice ? body.anchorPrice : existing.anchorPrice;
  let date = hasDate ? body.anchorPriceDate : existing.anchorPriceDate;

  if (!isBlank(price)) {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return { error: "invalid_anchor_price" };
    price = Math.round(n * 100) / 100;
  } else price = null;

  if (!isBlank(date)) {
    date = toAnchorDate(date);
    if (!date) return { error: "invalid_anchor_price_date" };
  } else date = null;

  if ((price === null) !== (date === null)) {
    return { error: price === null ? "anchor_price_required_with_date" : "anchor_price_date_required" };
  }
  return { values: { anchorPrice: price, anchorPriceDate: date } };
};

/** Mongoose plugin: adds the fields + a document-level pair check. */
const anchorPricePlugin = (schema) => {
  schema.add({
    anchorPrice: { type: Number, min: 0, default: null },
    anchorPriceDate: { type: Date, default: null },
  });
  schema.pre("validate", function (next) {
    const p = this.anchorPrice;
    const d = this.anchorPriceDate;
    if ((p === null || p === undefined) !== (d === null || d === undefined)) {
      return next(new Error(p == null ? "anchor_price_required_with_date" : "anchor_price_date_required"));
    }
    next();
  });
};

module.exports = { anchorPricePlugin, parseAnchorPriceInput, toAnchorDate };
