const crypto = require("crypto");
const { displayPercent } = require("../../paymentsIntegrations/billko/taxRateLabels");
const { getCopy, humanPaymentMethod } = require("../locales");

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

module.exports = {
  snapshotCardFromMonriPayload,
  computeHtmlHash,
  mapOrderItems,
  humanPaymentMethod,
};
