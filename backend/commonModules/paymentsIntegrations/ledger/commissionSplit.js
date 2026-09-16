/**
 * Commission split calculator (Payout Definition v5 §4).
 * Integer cents only. Organizer_net rounded half-up first;
 * pleis_net = received - organizer_net - gateway_cost.
 */

const { GATEWAY_RATE, gatewayCostFromReceived } = require("./ledgerWriter");

function halfUp(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.sign(x) * Math.round(Math.abs(x));
}

function clampRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0) return 0;
  if (r > 1) return Math.min(r / 100, 1);
  return Math.min(r, 1);
}

function defaultCommissionRates(overrides = {}) {
  return {
    ordering: clampRate(
      overrides.ordering ?? process.env.PLEIS_ORDERING_COMMISSION ?? 0,
    ),
    tip: clampRate(
      overrides.tip ??
        process.env.PLEIS_TIP_COMMISSION ??
        process.env.PLEIS_TIP_COMMISSION_RATE ??
        0,
    ),
    ticketing: clampRate(
      overrides.ticketing ?? process.env.PLEIS_TICKETING_COMMISSION ?? 0,
    ),
  };
}

function ratesFromSubscriptionCommissions(commissions = {}, fallback) {
  const base = fallback || defaultCommissionRates();
  const c = commissions || {};
  return {
    ordering:
      c.orderingCommission != null
        ? clampRate(c.orderingCommission)
        : base.ordering,
    tip: c.tipCommission != null ? clampRate(c.tipCommission) : base.tip,
    ticketing:
      c.ticketingCommission != null
        ? clampRate(c.ticketingCommission)
        : base.ticketing,
  };
}

function splitOrdering(input) {
  const orderGrossCents = Math.max(0, Math.round(Number(input.orderGrossCents) || 0));
  const tipCents = Math.max(0, Math.round(Number(input.tipCents) || 0));
  const received = orderGrossCents + tipCents;
  const orderingRate = clampRate(input.orderingRate ?? 0);
  const tipRate = clampRate(input.tipRate ?? 0);
  const gatewayRate =
    input.gatewayRate != null ? clampRate(input.gatewayRate) : GATEWAY_RATE;

  const organizerNet = halfUp(
    orderGrossCents * (1 - orderingRate) + tipCents * (1 - tipRate),
  );
  const gatewayCost = halfUp(received * gatewayRate);
  const pleisNet = received - organizerNet - gatewayCost;

  return {
    module: "ORDERING",
    receivedCents: received,
    orderGrossCents,
    tipCents,
    organizerNetCents: organizerNet,
    pleisNetCents: pleisNet,
    gatewayCostCents: gatewayCost,
    orderingRate,
    tipRate,
    gatewayRate,
  };
}

function splitTicketing(input) {
  const ticketPriceCents = Math.max(
    0,
    Math.round(Number(input.ticketPriceCents) || 0),
  );
  const serviceFeeCents = Math.max(
    0,
    Math.round(Number(input.serviceFeeCents) || 0),
  );
  const received = ticketPriceCents + serviceFeeCents;
  const ticketingRate = clampRate(input.ticketingRate ?? 0);
  const gatewayRate =
    input.gatewayRate != null ? clampRate(input.gatewayRate) : GATEWAY_RATE;

  const organizerNet = halfUp(ticketPriceCents * (1 - ticketingRate));
  const gatewayCost = halfUp(received * gatewayRate);
  const pleisNet = received - organizerNet - gatewayCost;

  return {
    module: "TICKETING",
    receivedCents: received,
    ticketPriceCents,
    serviceFeeCents,
    organizerNetCents: organizerNet,
    pleisNetCents: pleisNet,
    gatewayCostCents: gatewayCost,
    ticketingRate,
    gatewayRate,
  };
}

function splitLedgerEntry(entry, rates = defaultCommissionRates(), breakdown = {}) {
  const module = entry?.module;
  if (module === "ORDERING") {
    const tipCents = Math.round(Number(entry.tipAmountCents || 0));
    const received = Math.round(Number(entry.amountCents || 0));
    const orderGrossCents = Math.max(0, received - tipCents);
    return splitOrdering({
      orderGrossCents,
      tipCents,
      orderingRate: rates.ordering,
      tipRate: rates.tip,
    });
  }
  if (module === "TICKETING") {
    const received = Math.round(Number(entry.amountCents || 0));
    let ticketPriceCents =
      breakdown.ticketPriceCents != null
        ? Math.round(Number(breakdown.ticketPriceCents))
        : null;
    let serviceFeeCents =
      breakdown.serviceFeeCents != null
        ? Math.round(Number(breakdown.serviceFeeCents))
        : null;
    if (ticketPriceCents == null || serviceFeeCents == null) {
      if (breakdown.subtotalCents != null && breakdown.taxAmountCents != null) {
        ticketPriceCents = Math.round(Number(breakdown.subtotalCents));
        serviceFeeCents = Math.round(Number(breakdown.taxAmountCents));
      } else if (serviceFeeCents != null) {
        ticketPriceCents = Math.max(0, received - serviceFeeCents);
      } else {
        ticketPriceCents = received;
        serviceFeeCents = 0;
      }
    }
    if (ticketPriceCents + serviceFeeCents !== received && received > 0) {
      serviceFeeCents = Math.max(0, received - ticketPriceCents);
    }
    return splitTicketing({
      ticketPriceCents,
      serviceFeeCents,
      ticketingRate: rates.ticketing,
    });
  }
  const received = Math.round(Number(entry?.amountCents || 0));
  const gatewayCost =
    entry?.gatewayCostCents != null
      ? Math.round(Number(entry.gatewayCostCents))
      : gatewayCostFromReceived(received);
  return {
    module: module || "UNKNOWN",
    receivedCents: received,
    organizerNetCents: 0,
    pleisNetCents: received - gatewayCost,
    gatewayCostCents: gatewayCost,
    skipped: true,
  };
}

function aggregateSplits(splitsWithOrganizer) {
  const byOrganizer = new Map();
  let pleisNetTotal = 0;
  let gatewayTotal = 0;
  let receivedTotal = 0;

  for (const row of splitsWithOrganizer) {
    const orgKey = String(row.companyOrganizerId || "");
    const orgNet = Math.round(Number(row.organizerNetCents) || 0);
    const pleisNet = Math.round(Number(row.pleisNetCents) || 0);
    const gw = Math.round(Number(row.gatewayCostCents) || 0);
    const recv = Math.round(Number(row.receivedCents) || 0);

    pleisNetTotal += pleisNet;
    gatewayTotal += gw;
    receivedTotal += recv;

    if (!orgKey) continue;
    const prev = byOrganizer.get(orgKey) || {
      companyOrganizerId: orgKey,
      organizerNetCents: 0,
      entryIds: [],
      lineBreakdowns: [],
    };
    prev.organizerNetCents += orgNet;
    if (row.entryId) prev.entryIds.push(row.entryId);
    prev.lineBreakdowns.push(row);
    byOrganizer.set(orgKey, prev);
  }

  const organizers = [];
  const belowMin = [];
  for (const g of byOrganizer.values()) {
    if (g.organizerNetCents <= 0) belowMin.push(g);
    else organizers.push(g);
  }

  return {
    organizers,
    belowMin,
    pleisNetTotalCents: pleisNetTotal,
    gatewayTotalCents: gatewayTotal,
    receivedTotalCents: receivedTotal,
  };
}

module.exports = {
  halfUp,
  roundHalfUpCents: halfUp,
  clampRate,
  normalizeRate: clampRate,
  defaultCommissionRates,
  ratesFromSubscriptionCommissions,
  splitOrdering,
  splitTicketing,
  splitLedgerEntry,
  aggregateSplits,
  GATEWAY_RATE,
};
