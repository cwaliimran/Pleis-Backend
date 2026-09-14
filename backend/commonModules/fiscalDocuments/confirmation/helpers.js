const crypto = require("crypto");
const {
  displayPercent,
  PLEIS_REVENUE_TAX_LABEL,
} = require("../../paymentsIntegrations/billko/taxRateLabels");
const { getCopy, humanPaymentMethod } = require("../locales");
const { formatZagreb } = require("../shared/html");

function snapshotCardFromMonriPayload(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return { cardLast4: null, cardBrand: null };
  }
  const masked =
    payload.masked_pan ||
    payload.maskedPan ||
    payload.pan ||
    payload.card_number ||
    payload.number ||
    "";
  const digits = String(masked).replace(/\D/g, "");
  const cardLast4 = digits.length >= 4 ? digits.slice(-4) : null;
  const rawBrand = String(
    payload.cc_type || payload.card_brand || payload.brand || payload.cardType || "",
  ).trim();
  const cardBrand = rawBrand
    ? rawBrand.charAt(0).toUpperCase() + rawBrand.slice(1).toLowerCase()
    : null;
  return { cardLast4, cardBrand };
}

function computeHtmlHash(html) {
  return crypto.createHash("sha256").update(Buffer.from(html, "utf8")).digest("hex");
}

function computePdfHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function mapOrderItems(order, locale) {
  const copy = getCopy(locale);
  const rows = [];
  for (const item of order.items || []) {
    const snapshot = item.menuItemSnapShot || {};
    rows.push({
      name: snapshot.title || copy.item,
      vatPercent: displayPercent(snapshot.taxPercent ?? snapshot.taxPercentage),
      quantity: item.quantity,
      unitPrice: item.unitFinalPrice ?? item.unitPrice ?? 0,
      amount: item.finalPrice ?? 0,
    });
  }
  for (const combo of order.combos || []) {
    const snapshot = combo.comboSnapShot || {};
    rows.push({
      name: snapshot.name || snapshot.title || "Combo",
      vatPercent: displayPercent(snapshot.taxPercent ?? snapshot.taxPercentage),
      quantity: combo.quantity,
      unitPrice: combo.unitFinalPrice ?? combo.unitPrice ?? 0,
      amount: combo.finalPrice ?? 0,
    });
    for (const component of combo.items || []) {
      const componentSnap = component.menuItemSnapShot || {};
      rows.push({
        name: componentSnap.title || copy.item,
        vatPercent: displayPercent(
          componentSnap.taxPercent ?? componentSnap.taxPercentage,
        ),
        quantity: (component.quantity || 1) * (combo.quantity || 1),
        unitPrice: 0,
        amount: 0,
        isOption: true,
      });
    }
  }
  if (order.priceBreakdown?.tip) {
    rows.push({
      name: copy.tip,
      vatPercent: 0,
      quantity: 1,
      unitPrice: order.priceBreakdown.tip,
      amount: order.priceBreakdown.tip,
    });
  }
  return rows;
}

/**
 * Confirmation line items for ticketing: event context + ticket types +
 * individual ticket booking IDs + Pleis service fee.
 */
function mapTicketingItems({
  ticketLines = [],
  bookings = [],
  event = null,
  organization = null,
  serviceFee = 0,
  locale,
} = {}) {
  const copy = getCopy(locale);
  const rows = [];

  const eventTitle = event?.basicInfo?.title || "";
  const venueName =
    event?.basicInfo?.venue?.title ||
    organization?.basicInfo?.name ||
    "";
  const startAt = event?.schedule?.startDateTime;
  const endAt = event?.schedule?.endDateTime;

  if (eventTitle) {
    rows.push({
      name: eventTitle,
      vatPercent: 0,
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      isOption: true,
    });
  }

  const whenParts = [];
  if (startAt) {
    whenParts.push(
      endAt
        ? `${formatZagreb(startAt, locale)} – ${formatZagreb(endAt, locale)}`
        : formatZagreb(startAt, locale),
    );
  }
  if (venueName) whenParts.push(venueName);
  if (whenParts.length) {
    rows.push({
      name: whenParts.join(" · "),
      vatPercent: 0,
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      isOption: true,
    });
  }

  for (const line of ticketLines) {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unitRetailPrice || 0);
    rows.push({
      name: line.name || copy.item,
      vatPercent: displayPercent(line.taxRateLabel),
      quantity,
      unitPrice,
      amount: Number((unitPrice * quantity).toFixed(2)),
    });
  }

  for (const booking of bookings) {
    const id = booking.ticketBookingId || String(booking._id || "");
    if (!id) continue;
    const bits = [`${copy.ticketId}: ${id}`];
    if (booking.isFastTrack) bits.push(copy.fastTrack);
    if (booking.ticket?.timeSlot) bits.push(String(booking.ticket.timeSlot));
    rows.push({
      name: bits.join(" · "),
      vatPercent: 0,
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      isOption: true,
    });
  }

  const fee = Number(serviceFee || 0);
  if (fee > 0) {
    rows.push({
      name: copy.serviceFee,
      vatPercent: displayPercent(PLEIS_REVENUE_TAX_LABEL),
      quantity: 1,
      unitPrice: fee,
      amount: fee,
    });
  }

  return rows;
}

module.exports = {
  snapshotCardFromMonriPayload,
  computeHtmlHash,
  computePdfHash,
  mapOrderItems,
  mapTicketingItems,
  humanPaymentMethod,
};
