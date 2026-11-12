/**
 * Transaction list on the payment ledger (Requirement Set #10, #8).
 *
 * #10  One row per captured payment. The source is PaymentLedgerEntry, which is
 *      written only on a paid capture and is unique on (orderId, module): a
 *      pending, failed or abandoned Monri attempt never produces a row.
 * #8   Two visibilities. An organizer never receives the service fee, the
 *      gateway cost or rate, Pleis net, or a ticketing service-fee invoice, and
 *      the Company / Country scope is not theirs to choose (Filters v5 §2.5).
 *      Commission rate and amount stay visible (they come out of the
 *      organizer's money). The same rules apply to the CSV export.
 *
 * Money is computed with the payout statement's own split (commissionSplit),
 * so the list, the export and the statement agree to the cent.
 */
const mongoose = require("mongoose");
const PaymentLedgerEntry = require("../PaymentLedgerEntry.model");
const { splitLedgerEntry } = require("../commissionSplit");
const { loadCommissionRates } = require("../statementService");
const {
  buildPaymentMethodLabel,
  METHOD_LABEL,
} = require("../../../menuItemsAndOrders/paymentMethods");

const ObjectId = mongoose.Types.ObjectId;

const MODULE_CATEGORY = {
  TICKETING: "ticketing",
  ORDERING: "ordering",
  RESERVATION: "reservations",
  SUBSCRIPTION: "subscriptions",
};
const CATEGORY_MODULE = Object.fromEntries(
  Object.entries(MODULE_CATEGORY).map(([m, c]) => [c, m]),
);

// Date basis → ledger column (prototype v12.2 "Date basis" select).
const DATE_BASIS_FIELD = {
  captured_at: "capturedAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
  settled_at: "payoutPaidAt",
  fiscalized_at: "fiscalizedAt",
  excluded_at: "excludedAt",
};

const SA_ONLY_INVOICE_KINDS = new Set(["service_fee"]);

const centsToEuro = (cents) => Math.round(Number(cents) || 0) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toList = (v) =>
  v === undefined || v === null || v === ""
    ? []
    : (Array.isArray(v) ? v : String(v).split(","))
        .map((x) => String(x).trim())
        .filter(Boolean);

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username || "" : "";

/* ------------------------------------------------------------------ query */

async function buildMatch(scope, query = {}) {
  const and = [];

  // Scope. Organizer / manager: their organizations (+ the organizer's own
  // subscription payments). Super admin: global, or the chosen company.
  if (!scope.isSuperAdmin) {
    const orgs = scope.organizations || [];
    const or = [{ organization: { $in: orgs } }];
    if (!scope.isManager && scope.companyOrganizer) {
      or.push({
        module: "SUBSCRIPTION",
        companyOrganizer: new ObjectId(String(scope.companyOrganizer)),
      });
    }
    and.push({ $or: or });
  } else if (scope.organizations) {
    and.push({ organization: { $in: scope.organizations } });
  }

  const modules = toList(query.module || query.category)
    .map((m) => CATEGORY_MODULE[m] || String(m).toUpperCase())
    .filter((m) => MODULE_CATEGORY[m]);
  if (modules.length) and.push({ module: { $in: modules } });

  const payoutStatuses = toList(query.payoutStatus || query.settlementStatus);
  if (payoutStatuses.length) and.push({ payoutStatus: { $in: payoutStatuses } });

  const fiscal = toList(query.fiscalizationStatus);
  if (fiscal.length) and.push({ fiscalizationStatus: { $in: fiscal } });

  const tracks = toList(query.track || query.paymentChannel);
  if (tracks.length) and.push({ paymentChannel: { $in: tracks } });

  const methods = toList(query.paymentMethod);
  if (methods.length) and.push({ paymentMethod: { $in: methods } });

  // Range on the chosen basis; inclusive both ends. A row whose basis column
  // is null is outside any bounded range (Filters v5 §2.3).
  const basisField = DATE_BASIS_FIELD[query.dateBasis] || "capturedAt";
  const from = parseDate(query.from || query.startDate);
  const to = parseDate(query.to || query.endDate);
  if (from || to) {
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    and.push({ [basisField]: range });
  }

  const keyword = String(query.keyword || query.search || "").trim();
  if (keyword) {
    const rx = new RegExp(escapeRegex(keyword), "i");
    const or = [{ providerTransactionId: rx }, { confirmationNumber: rx }];
    if (ObjectId.isValid(keyword)) {
      or.push({ orderId: new ObjectId(keyword) }, { _id: new ObjectId(keyword) });
    }
    const MenuOrders = require("@OrdersModel");
    const [orders, users] = await Promise.all([
      MenuOrders.find({ orderNumber: rx }).select("_id").limit(200).lean(),
      mongoose
        .model("User")
        .find({ $or: [{ email: rx }, { firstName: rx }, { lastName: rx }, { username: rx }] })
        .select("_id")
        .limit(500)
        .lean(),
    ]);
    if (orders.length) or.push({ orderId: { $in: orders.map((o) => o._id) } });
    if (users.length) or.push({ user: { $in: users.map((u) => u._id) } });
    and.push({ $or: or });
  }

  return { match: and.length ? { $and: and } : {}, basisField };
}

/* ---------------------------------------------------------------- context */

async function loadContexts(entries) {
  const idsOf = (module) =>
    entries.filter((e) => e.module === module).map((e) => e.orderId);
  const orderIds = entries.map((e) => e.orderId);
  const userIds = [...new Set(entries.map((e) => String(e.user || "")).filter(Boolean))];
  const orgIds = [
    ...new Set(entries.map((e) => String(e.organization || "")).filter(Boolean)),
  ];

  const MenuOrders = require("@OrdersModel");
  const { TicketingOrders } = require("@TicketingOrdersModel");
  const { UserReservations } = require("@UserReservationsModel");
  const PaymentConfirmation = require("../../../fiscalDocuments/models/PaymentConfirmation.model");
  const BillkoInvoice = require("../../../fiscalDocuments/models/BillkoInvoice.model");
  const WebhookEvent = require("../../paymentsWebhook/repositories/WebhookTransactionsEvent.model");

  const [menu, tickets, reservations, users, orgs, confirmations, invoices, attempts] =
    await Promise.all([
      MenuOrders.find({ _id: { $in: idsOf("ORDERING") } })
        .select(
          "orderNumber paymentMethod paymentMethodLabel paymentComposition priceBreakdown totalPrice tableNumber paymentStatus editHistory",
        )
        .lean(),
      TicketingOrders.find({ _id: { $in: idsOf("TICKETING") } })
        .select("orderPricing event paymentDetails")
        .lean(),
      UserReservations.find({ _id: { $in: idsOf("RESERVATION") } })
        .select("reservationType amount paymentDetails voucher")
        .lean(),
      mongoose
        .model("User")
        .find({ _id: { $in: userIds } })
        .select("firstName lastName username email")
        .lean(),
      mongoose
        .model("Organizations")
        .find({ _id: { $in: orgIds } })
        .select("basicInfo.name")
        .lean(),
      PaymentConfirmation.find({ orderId: { $in: orderIds } })
        .select("confirmationNumber orderId status cancelsConfirmationId createdAt")
        .lean(),
      BillkoInvoice.find({ orderId: { $in: orderIds } })
        .select("orderId kind invoiceNumber status fiscalizationNumber seller createdAt")
        .lean(),
      WebhookEvent.find({ orderNumber: { $in: orderIds } })
        .select("orderNumber paymentStatus transactionId paymentMethod createdAt")
        .sort({ createdAt: 1 })
        .lean(),
    ]);

  const eventIds = tickets.map((t) => t.event).filter(Boolean);
  const typeIds = reservations.map((r) => r.reservationType).filter(Boolean);
  const [events, types] = await Promise.all([
    eventIds.length
      ? mongoose.model("Event").find({ _id: { $in: eventIds } }).select("basicInfo.title").lean()
      : [],
    typeIds.length && mongoose.models.ReservationType
      ? mongoose.models.ReservationType.find({ _id: { $in: typeIds } }).lean()
      : [],
  ]);

  const byId = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const groupBy = (rows, key) => {
    const map = new Map();
    for (const r of rows) {
      const k = String(r[key]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  };

  return {
    menu: byId(menu),
    tickets: byId(tickets),
    reservations: byId(reservations),
    users: byId(users),
    orgs: byId(orgs),
    events: byId(events),
    types: byId(types),
    confirmations: groupBy(confirmations, "orderId"),
    invoices: groupBy(invoices, "orderId"),
    attempts: groupBy(attempts, "orderNumber"),
  };
}

/* -------------------------------------------------------------------- row */

function ticketingBreakdown(order) {
  if (!order?.orderPricing) return {};
  const subtotal = Math.round(Number(order.orderPricing.subtotal || 0) * 100);
  const fee = Math.round(Number(order.orderPricing.taxAmount || 0) * 100);
  return { ticketPriceCents: subtotal, serviceFeeCents: fee };
}

function paymentOf(entry, ctx) {
  const card =
    entry.cardLast4 || entry.cardBrand
      ? `${entry.cardBrand ? entry.cardBrand.toUpperCase() : "Card"} •••• ${entry.cardLast4 || ""}`.trim()
      : undefined;
  if (entry.module === "ORDERING") {
    const order = ctx.menu.get(String(entry.orderId));
    const voucher = Number(order?.priceBreakdown?.voucherDiscount || 0);
    const method = order?.paymentMethod || entry.paymentMethod;
    const label =
      order?.paymentMethodLabel ||
      buildPaymentMethodLabel({ paymentMethod: method, voucherAmount: voucher });
    const composition =
      order?.paymentComposition?.length
        ? order.paymentComposition
        : [
            ...(voucher > 0 ? [{ type: "voucher", amount: voucher }] : []),
            ...(method !== "voucher" && Number(order?.totalPrice || 0) > 0
              ? [{ type: method, amount: Number(order.totalPrice) }]
              : []),
          ];
    return { label, subNote: card, composition };
  }
  const method = entry.paymentMethod || "card";
  return { label: METHOD_LABEL[method] || method, subNote: card, composition: [] };
}

function subtypeOf(entry, ctx) {
  const id = String(entry.orderId);
  if (entry.module === "ORDERING") {
    const o = ctx.menu.get(id);
    return o?.orderNumber ? `Order ${o.orderNumber}` : "Order";
  }
  if (entry.module === "TICKETING") {
    const t = ctx.tickets.get(id);
    return ctx.events.get(String(t?.event))?.basicInfo?.title || "Tickets";
  }
  if (entry.module === "RESERVATION") {
    const r = ctx.reservations.get(id);
    const type = ctx.types.get(String(r?.reservationType));
    return type?.title || type?.name || "Reservation";
  }
  return "Subscription";
}

function referenceOf(entry, ctx) {
  if (entry.module === "ORDERING") {
    return ctx.menu.get(String(entry.orderId))?.orderNumber || String(entry.orderId);
  }
  return String(entry.orderId);
}

function documentsOf(entry, ctx, isSuperAdmin) {
  const docs = [];
  for (const c of ctx.confirmations.get(String(entry.orderId)) || []) {
    docs.push({
      code: c.cancelsConfirmationId ? "STORNO" : "CONF",
      label: c.cancelsConfirmationId ? "Cancellation confirmation" : "Payment confirmation",
      subtitle: c.confirmationNumber,
      number: c.confirmationNumber,
      status: c.status,
    });
  }
  for (const inv of ctx.invoices.get(String(entry.orderId)) || []) {
    if (!isSuperAdmin && SA_ONLY_INVOICE_KINDS.has(inv.kind)) continue;
    docs.push({
      code: inv.kind === "commission" ? "ERACUN" : inv.kind === "refund_storno" ? "STORNO" : "INV",
      label: inv.kind === "commission" ? "Commission eRačun" : "Invoice",
      subtitle: inv.invoiceNumber || inv.status,
      number: inv.invoiceNumber || null,
      kind: inv.kind,
      status: inv.status,
    });
  }
  return docs;
}

function buildRow(entry, ctx, rates, isSuperAdmin) {
  const id = String(entry.orderId);
  const breakdown = entry.module === "TICKETING" ? ticketingBreakdown(ctx.tickets.get(id)) : {};
  const split = splitLedgerEntry(entry, rates, breakdown);
  const commissioned = entry.module === "ORDERING" || entry.module === "TICKETING";

  const received = split.receivedCents;
  const serviceFee = split.serviceFeeCents || 0;
  const commissionCents = commissioned
    ? received - serviceFee - split.organizerNetCents
    : null;
  const rate =
    entry.module === "ORDERING"
      ? split.orderingRate
      : entry.module === "TICKETING"
        ? split.ticketingRate
        : null;

  const user = ctx.users.get(String(entry.user));
  const org = ctx.orgs.get(String(entry.organization));
  const payment = paymentOf(entry, ctx);
  const documents = documentsOf(entry, ctx, isSuperAdmin);
  const refunded =
    ctx.tickets.get(id)?.paymentDetails?.paymentStatus === "refunded" ||
    ctx.reservations.get(id)?.paymentDetails?.paymentStatus === "refunded";
  const track = entry.paymentChannel === "offapp" ? "Off-app" : "Payout";
  const editCount = ctx.menu.get(id)?.editHistory?.length || 0;

  const row = {
    id: String(entry._id),
    ledgerEntryId: String(entry._id),
    orderId: id,
    transactionId: entry.providerTransactionId || entry.confirmationNumber || String(entry._id),
    reference: referenceOf(entry, ctx),
    user: user ? { name: fullName(user), email: user.email || "" } : null,
    organization: org?.basicInfo?.name || null,
    category: MODULE_CATEGORY[entry.module] || "ordering",
    subtype: subtypeOf(entry, ctx),
    status: refunded ? "refunded" : "completed",
    amount: centsToEuro(received),
    commissionRate: commissioned && rate != null ? Math.round(rate * 10000) / 100 : null,
    commissionAmount: commissionCents != null ? centsToEuro(commissionCents) : null,
    organizerNet: commissioned ? centsToEuro(split.organizerNetCents) : null,
    paymentMethod: payment.label,
    paymentSubNote: payment.subNote,
    paymentChannel: entry.paymentChannel || "pleis",
    settlementStatus: entry.payoutStatus || null,
    settlementNote: entry.exclusionReason ? `${track} · ${entry.exclusionReason}` : track,
    fiscalizationStatus: entry.fiscalizationStatus || null,
    documents: [...new Set(documents.map((d) => d.code))],
    capturedAt: entry.capturedAt ? new Date(entry.capturedAt).toISOString() : null,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
    edited: editCount > 0,
    detail: {
      moneySplit: {
        gross: centsToEuro(received),
        commissionRate: commissioned && rate != null ? Math.round(rate * 10000) / 100 : null,
        commissionAmount: commissionCents != null ? centsToEuro(commissionCents) : null,
        organizerNet: commissioned ? centsToEuro(split.organizerNetCents) : null,
      },
      paymentComposition: payment.composition,
      parties: {
        buyer: { name: fullName(user) || "—", subtitle: user?.email || "" },
        organizer: org ? { name: org.basicInfo?.name || "", subtitle: "Organization" } : undefined,
        pleis: { name: "Pleis", subtitle: "Intermediary" },
      },
      settlement: {
        track,
        status: entry.payoutStatus || null,
        batch: entry.statementId || undefined,
        eligibility: entry.exclusionReason || undefined,
      },
      fiscalization: {
        status: entry.fiscalizationStatus || null,
        documentStatus: documents.length ? `${documents.length} document(s)` : "No documents",
        documents,
      },
      paymentAttempts: (ctx.attempts.get(id) || []).map((a, i) => ({
        index: i + 1,
        status:
          a.paymentStatus === "paid" ? "succeeded" : a.paymentStatus === "refunded" ? "refunded" : "failed",
        detail: `${a.paymentStatus} · ${a.transactionId || "—"} · ${new Date(a.createdAt).toISOString()}`,
      })),
      editCount,
    },
  };

  // Superadmin-only figures (Filters v5 §2.5). Never attached for an organizer.
  if (isSuperAdmin) {
    // A reservation prepayment is not Pleis revenue; its payout treatment is
    // decided on the statement, so no Pleis net is shown for it here.
    row.pleisNet = entry.module === "RESERVATION" ? null : centsToEuro(split.pleisNetCents);
    row.serviceFee = centsToEuro(serviceFee);
    row.gatewayCost = centsToEuro(split.gatewayCostCents);
    row.detail.moneySplit.pleisNet = row.pleisNet;
    if (serviceFee) {
      row.detail.moneySplit.serviceFeeLabel = "Service fee";
      row.detail.moneySplit.serviceFeeAmount = row.serviceFee;
    }
    row.detail.moneySplit.gatewayCostLabel = `Gateway cost (${Math.round((split.gatewayRate || 0) * 10000) / 100}%)`;
    row.detail.moneySplit.gatewayCostAmount = row.gatewayCost;
  }
  return row;
}

/* ---------------------------------------------------------------- public */

async function listTransactions(scope, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 25));
  const { match, basisField } = await buildMatch(scope, query);

  const [entries, total, rates] = await Promise.all([
    PaymentLedgerEntry.find(match)
      .sort({ [basisField]: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PaymentLedgerEntry.countDocuments(match),
    loadCommissionRates(),
  ]);
  const ctx = await loadContexts(entries);
  const rows = entries.map((e) => buildRow(e, ctx, rates, scope.isSuperAdmin));
  const stats = await summarize(match, rates, scope.isSuperAdmin);

  return {
    rows,
    stats,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Tiles sum exactly the rows the filters show (prototype v12.2). */
async function summarize(match, rates, isSuperAdmin) {
  const entries = await PaymentLedgerEntry.find(match)
    .select("module orderId amountCents tipAmountCents gatewayCostCents")
    .limit(20000)
    .lean();
  const ticketIds = entries.filter((e) => e.module === "TICKETING").map((e) => e.orderId);
  const { TicketingOrders } = require("@TicketingOrdersModel");
  const tickets = ticketIds.length
    ? await TicketingOrders.find({ _id: { $in: ticketIds } }).select("orderPricing").lean()
    : [];
  const ticketMap = new Map(tickets.map((t) => [String(t._id), t]));

  const totals = { count: entries.length, gross: 0, commission: 0, organizerNet: 0, pleisNet: 0, serviceFee: 0 };
  for (const e of entries) {
    const split = splitLedgerEntry(
      e,
      rates,
      e.module === "TICKETING" ? ticketingBreakdown(ticketMap.get(String(e.orderId))) : {},
    );
    const fee = split.serviceFeeCents || 0;
    totals.gross += split.receivedCents;
    totals.serviceFee += fee;
    if (e.module !== "RESERVATION") totals.pleisNet += split.pleisNetCents;
    if (e.module === "ORDERING" || e.module === "TICKETING") {
      totals.commission += split.receivedCents - fee - split.organizerNetCents;
      totals.organizerNet += split.organizerNetCents;
    }
  }
  const out = {
    count: totals.count,
    gross: centsToEuro(totals.gross),
    commission: centsToEuro(totals.commission),
    organizerNet: centsToEuro(totals.organizerNet),
  };
  if (isSuperAdmin) {
    out.pleisNet = centsToEuro(totals.pleisNet);
    out.serviceFee = centsToEuro(totals.serviceFee);
  }
  return out;
}

async function getTransaction(scope, id) {
  if (!ObjectId.isValid(String(id))) return null;
  const { match } = await buildMatch(scope, {});
  const entry = await PaymentLedgerEntry.findOne({
    $and: [match, { $or: [{ _id: new ObjectId(String(id)) }, { orderId: new ObjectId(String(id)) }] }],
  }).lean();
  if (!entry) return null;
  const [ctx, rates] = await Promise.all([loadContexts([entry]), loadCommissionRates()]);
  return buildRow(entry, ctx, rates, scope.isSuperAdmin);
}

const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const zagreb = (iso) =>
  iso
    ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Zagreb" }).slice(0, 19)
    : "";
const money = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));

/** CSV of the filtered rows; organizer exports never carry SA columns (#8). */
async function exportTransactionsCsv(scope, query = {}) {
  const { match, basisField } = await buildMatch(scope, query);
  const [entries, rates] = await Promise.all([
    PaymentLedgerEntry.find(match).sort({ [basisField]: -1, _id: -1 }).limit(50000).lean(),
    loadCommissionRates(),
  ]);
  const ctx = await loadContexts(entries);
  const rows = entries.map((e) => buildRow(e, ctx, rates, scope.isSuperAdmin));

  const columns = [
    ["Captured at (Europe/Zagreb)", (r) => zagreb(r.capturedAt)],
    ["Transaction ID", (r) => r.transactionId],
    ["Order reference", (r) => r.reference],
    ["Module", (r) => r.category],
    ["What", (r) => r.subtype],
    ["Organization", (r) => r.organization],
    ["Buyer", (r) => r.user?.name],
    ["Buyer email", (r) => r.user?.email],
    ["Payment method", (r) => r.paymentMethod],
    ["Payment split", (r) =>
      (r.detail.paymentComposition || [])
        .map((p) => `${p.type === "voucher" ? "Voucher" : METHOD_LABEL[p.type] || p.type} ${money(p.amount)}`)
        .join(" + ")],
    ["Gross EUR", (r) => money(r.amount)],
    ["Commission rate %", (r) => (r.commissionRate == null ? "" : r.commissionRate)],
    ["Commission EUR", (r) => money(r.commissionAmount)],
    ["Organizer payout EUR", (r) => money(r.organizerNet)],
    ...(scope.isSuperAdmin
      ? [
          ["Service fee EUR", (r) => money(r.serviceFee)],
          ["Gateway cost EUR", (r) => money(r.gatewayCost)],
          ["Pleis net EUR", (r) => money(r.pleisNet)],
        ]
      : []),
    ["Settlement track", (r) => (r.paymentChannel === "offapp" ? "Off-app" : "Payout")],
    ["Payout status", (r) => r.settlementStatus],
    ["Fiscalization status", (r) => r.fiscalizationStatus],
    ["Documents", (r) => r.detail.fiscalization.documents.map((d) => d.number || d.code).join(" ")],
    ["Status", (r) => r.status],
    ["Edited before payment", (r) => (r.edited ? "yes" : "no")],
  ];

  const lines = [columns.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(columns.map(([, f]) => csvCell(f(r))).join(","));
  return `﻿${lines.join("\n")}`;
}

module.exports = {
  DATE_BASIS_FIELD,
  buildMatch,
  buildRow,
  listTransactions,
  getTransaction,
  exportTransactionsCsv,
};
