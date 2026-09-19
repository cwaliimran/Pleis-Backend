/**
 * Payout statement lifecycle service (Phase B — Payout §3, §4, §5–§9).
 * Manual generate → download pain.001 → confirm/cancel. No auto bank submit.
 * Fiscalize is Phase C — confirm only sets PAID + NOT_FISCALIZED.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");

const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const PayoutBatch = require("./PayoutBatch.model");
const {
  loadPleisPayoutConfig,
  assertPleisPayoutConfig,
} = require("./pleisPayoutConfig");
const {
  isLedgerEntrySelectable,
  shouldPromoteHeldToPending,
  isCapturedInPeriod,
  assertNoPendingStatement,
  resolvePeriodStart,
  endOfDayZagreb,
  zagrebYmd,
} = require("./statementEligibility");
const {
  defaultCommissionRates,
  ratesFromSubscriptionCommissions,
  splitLedgerEntry,
  aggregateSplits,
} = require("./commissionSplit");
const { buildPain001Xml } = require("./pain001Builder");
const {
  normalizeIban,
  isValidIbanChecksum,
  isValidOib,
  sanitizePainText,
} = require("./ibanOibValidation");
const {
  applyConfirmTransition,
  applyCancelTransition,
  ledgerConfirmPatch,
  ledgerCancelPatch,
} = require("./statementTransitions");

function hashXml(xml) {
  return crypto.createHash("sha256").update(xml, "utf8").digest("hex");
}

function parseOrganizerAddress(companyDetails = {}) {
  const loc = companyDetails.location || {};
  const town = String(loc.city || "").trim();
  const postcode = String(loc.postalCode || "").trim();
  let country = String(loc.country || "").trim().toUpperCase();
  if (country === "CROATIA" || country === "HRVATSKA") country = "HR";
  if (country.length > 2) country = country.slice(0, 2);
  if (!country) country = "HR";

  let street = "";
  let buildingNo = "";
  const full = String(loc.fullAddress || "").trim();
  if (full) {
    const beforeComma = full.split(",")[0].trim();
    const m = beforeComma.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/);
    if (m) {
      street = m[1].trim();
      buildingNo = m[2].trim();
    } else {
      street = beforeComma;
    }
  }

  return {
    street: street || "Adresa",
    buildingNo: buildingNo || "1",
    postcode: postcode || "00000",
    town: town || "",
    country,
  };
}

async function loadCommissionRates() {
  try {
    const {
      SubscriptionSettings,
    } = require("../../subscriptions/SubscriptionSettings");
    const doc = await SubscriptionSettings.findOne({})
      .select("commissions")
      .lean();
    if (doc?.commissions) {
      return ratesFromSubscriptionCommissions(
        doc.commissions,
        defaultCommissionRates(),
      );
    }
  } catch {
    /* isolated tests */
  }
  return defaultCommissionRates();
}

async function loadOrganizerCreditor(companyOrganizerId) {
  if (!companyOrganizerId) {
    return { ready: false, missing: ["organizer"], entry: null };
  }
  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select(
      "companyDetails.name companyDetails.oib companyDetails.bankAccountNumber companyDetails.location",
    )
    .lean();
  if (!organizer) {
    return { ready: false, missing: ["organizer"], entry: null };
  }
  const cd = organizer.companyDetails || {};
  const name = sanitizePainText(cd.name || "", 70);
  const oib = String(cd.oib || "").trim();
  const iban = normalizeIban(cd.bankAccountNumber || "");
  const address = parseOrganizerAddress(cd);
  const missing = [];
  if (!name) missing.push("name");
  if (!oib || !isValidOib(oib)) missing.push("oib");
  if (!iban || !isValidIbanChecksum(iban)) missing.push("iban");
  if (!address.town) missing.push("town");
  if (!address.country) missing.push("country");

  return {
    ready: missing.length === 0,
    missing,
    entry: {
      companyOrganizerId: String(companyOrganizerId),
      name,
      oib,
      iban,
      address,
    },
  };
}

async function loadServiceContext(ledgerEntry) {
  const ctx = { now: new Date() };
  if (ledgerEntry.module === "TICKETING") {
    try {
      const { TicketingOrders } = require("@TicketingOrdersModel");
      const order = await TicketingOrders.findById(ledgerEntry.orderId)
        .select("event orderPricing paymentDetails")
        .lean();
      if (order?.event) {
        const Events = mongoose.model("Event");
        const event = await Events.findById(order.event)
          .select("schedule.endDateTime")
          .lean();
        ctx.event = event;
        ctx.eventEndAt = event?.schedule?.endDateTime;
      }
      ctx.refunded =
        String(order?.paymentDetails?.paymentStatus || "").toLowerCase() ===
        "refunded";
      if (order?.orderPricing) {
        ctx.breakdown = {
          subtotalCents: Math.round(Number(order.orderPricing.subtotal || 0) * 100),
          taxAmountCents: Math.round(
            Number(order.orderPricing.taxAmount || 0) * 100,
          ),
          ticketPriceCents: Math.round(
            Number(order.orderPricing.subtotal || 0) * 100,
          ),
          serviceFeeCents: Math.round(
            Number(order.orderPricing.taxAmount || 0) * 100,
          ),
        };
      }
    } catch (err) {
      console.warn("[payout] ticketing context:", err.message);
    }
  } else if (ledgerEntry.module === "ORDERING") {
    try {
      const MenuOrders = require("@OrdersModel");
      const order = await MenuOrders.findById(ledgerEntry.orderId)
        .select("status paymentStatus paymentDetails")
        .lean();
      ctx.order = order;
      ctx.refunded =
        String(order?.paymentStatus || "").toLowerCase() === "refunded" ||
        String(order?.paymentDetails?.paymentStatus || "").toLowerCase() ===
          "refunded";
    } catch (err) {
      console.warn("[payout] ordering context:", err.message);
    }
  }
  return ctx;
}

async function nextDailySequences(ymd) {
  const prefix = `INST${ymd}`;
  const stmtPrefix = `PLEIS-STMT-${ymd}-`;
  const existing = await PayoutBatch.find({
    $or: [
      { msgId: new RegExp(`^${prefix}`) },
      { batchReference: new RegExp(`^${stmtPrefix}`) },
    ],
  })
    .select("msgId batchReference fileSequence")
    .lean();

  let maxMsg = 0;
  let maxStmt = 0;
  let maxFile = 0;
  for (const row of existing) {
    const m = String(row.msgId || "").match(/INST\d{8}(\d{4})$/);
    if (m) maxMsg = Math.max(maxMsg, Number(m[1]));
    const s = String(row.batchReference || "").match(/PLEIS-STMT-\d{8}-(\d+)$/);
    if (s) maxStmt = Math.max(maxStmt, Number(s[1]));
    if (row.fileSequence) maxFile = Math.max(maxFile, Number(row.fileSequence));
  }
  return {
    msgSeq: maxMsg + 1,
    stmtSeq: maxStmt + 1,
    fileSeq: maxFile + 1,
  };
}

async function generateStatement({
  endDay,
  periodEnd: periodEndArg,
  actorId,
  userId,
  notes = "",
} = {}) {
  const day = endDay || periodEndArg;
  const actor = actorId || userId || null;
  const pleis = assertPleisPayoutConfig(loadPleisPayoutConfig());
  const rates = await loadCommissionRates();

  const pending = await PayoutBatch.findOne({ status: "PENDING" }).lean();
  assertNoPendingStatement(pending);

  const last = await PayoutBatch.findOne({
    status: { $in: ["PENDING", "PAID"] },
  })
    .sort({ periodEnd: -1 })
    .lean();

  const periodEnd = endOfDayZagreb(day);
  if (Number.isNaN(periodEnd.getTime())) {
    const err = new Error("invalid_end_day");
    err.code = "INVALID_END_DAY";
    err.statusCode = 400;
    throw err;
  }

  const periodStartProbe = resolvePeriodStart({
    lastStatementPeriodEnd: last?.periodEnd,
    goLiveDate: pleis.goLiveDate || undefined,
  });

  const candidates = await PaymentLedgerEntry.find({
    statementId: null,
    payoutStatus: { $in: ["PENDING", "HELD"] },
    module: { $in: ["TICKETING", "ORDERING"] },
    capturedAt: { $gte: periodStartProbe, $lte: periodEnd },
  }).lean();

  const selectable = [];
  const toPromote = [];
  let earliest = null;

  for (const entry of candidates) {
    const ctx = await loadServiceContext(entry);
    if (!isCapturedInPeriod(entry, periodStartProbe, periodEnd)) continue;
    if (!isLedgerEntrySelectable(entry, ctx)) continue;
    if (shouldPromoteHeldToPending(entry, ctx)) toPromote.push(entry._id);
    selectable.push({ entry, ctx });
    const cap = new Date(entry.capturedAt).getTime();
    if (earliest == null || cap < earliest) earliest = cap;
  }

  const periodStart = resolvePeriodStart({
    lastStatementPeriodEnd: last?.periodEnd,
    goLiveDate: pleis.goLiveDate || undefined,
    earliestEligibleCapturedAt:
      earliest != null ? new Date(earliest) : undefined,
  });

  if (!selectable.length) {
    return {
      empty: true,
      message: "nothing to pay out for this period",
      periodStart,
      periodEnd,
    };
  }

  // Explicit Phase B: promote HELD→PENDING when service_completed at generate
  if (toPromote.length) {
    await PaymentLedgerEntry.updateMany(
      { _id: { $in: toPromote }, payoutStatus: "HELD", statementId: null },
      { $set: { payoutStatus: "PENDING" } },
    );
  }

  const splitRows = [];
  const incompleteMap = new Map();
  const creditorCache = new Map();

  for (const { entry, ctx } of selectable) {
    const orgId = entry.companyOrganizer ? String(entry.companyOrganizer) : "";
    if (!orgId) {
      const prev = incompleteMap.get("_missing_org") || {
        companyOrganizer: null,
        missing: ["organizer"],
        entryIds: [],
        reason: "missing_company_organizer",
      };
      prev.entryIds.push(entry._id);
      incompleteMap.set("_missing_org", prev);
      continue;
    }

    if (!creditorCache.has(orgId)) {
      creditorCache.set(orgId, await loadOrganizerCreditor(orgId));
    }
    const creditor = creditorCache.get(orgId);
    if (!creditor.ready) {
      const prev = incompleteMap.get(orgId) || {
        companyOrganizer: entry.companyOrganizer,
        missing: creditor.missing,
        entryIds: [],
        reason: "incomplete_payout_data",
      };
      prev.entryIds.push(entry._id);
      incompleteMap.set(orgId, prev);
      continue;
    }

    const split = splitLedgerEntry(entry, rates, ctx.breakdown || {});
    splitRows.push({
      entryId: entry._id,
      companyOrganizerId: orgId,
      creditor: creditor.entry,
      receivedCents: split.receivedCents,
      organizerNetCents: split.organizerNetCents,
      pleisNetCents: split.pleisNetCents,
      gatewayCostCents: split.gatewayCostCents,
      module: split.module,
      split,
    });
  }

  const agg = aggregateSplits(splitRows);
  const belowMinIds = new Set();
  for (const g of agg.belowMin) {
    for (const id of g.entryIds) belowMinIds.add(String(id));
  }

  const includedRows = splitRows.filter(
    (r) =>
      !belowMinIds.has(String(r.entryId)) &&
      agg.organizers.some((o) => o.companyOrganizerId === r.companyOrganizerId),
  );

  if (!includedRows.length) {
    return {
      empty: true,
      message: "nothing to pay out after filters",
      periodStart,
      periodEnd,
      incompleteOrganizers: [...incompleteMap.values()],
    };
  }

  const ymd = zagrebYmd(periodEnd);
  const seqs = await nextDailySequences(ymd);
  const batchReference = `PLEIS-STMT-${ymd}-${String(seqs.stmtSeq).padStart(2, "0")}`;
  const msgId = `INST${ymd}${String(seqs.msgSeq).padStart(4, "0")}`;
  const fileSequence = seqs.fileSeq;
  const reqdExctnDt = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

  const organizerLines = [];
  let lineNo = 0;
  for (const g of agg.organizers) {
    lineNo += 1;
    const sample = includedRows.find(
      (r) => r.companyOrganizerId === g.companyOrganizerId,
    );
    const creditor = sample?.creditor;
    if (!creditor) continue;
    organizerLines.push({
      kind: "ORGANIZER",
      companyOrganizer: g.companyOrganizerId,
      creditorName: creditor.name,
      creditorIban: creditor.iban,
      creditorOib: creditor.oib,
      amountCents: g.organizerNetCents,
      instrId: `PL-${ymd}-${String(lineNo).padStart(6, "0")}`,
      entryIds: g.entryIds,
      breakdown: g.lineBreakdowns.map((b) => ({
        entryId: b.entryId,
        receivedCents: b.receivedCents,
        organizerNetCents: b.organizerNetCents,
        pleisNetCents: b.pleisNetCents,
        gatewayCostCents: b.gatewayCostCents,
        module: b.module,
      })),
      address: creditor.address,
      name: creditor.name,
      oib: creditor.oib,
      iban: creditor.iban,
    });
  }

  const pleisNetForFile = includedRows.reduce((s, r) => s + r.pleisNetCents, 0);
  const commissionAmountCents = Math.max(0, pleisNetForFile);

  const built = buildPain001Xml({
    pleis,
    msgId,
    pmtInfId: batchReference,
    creDtTm: new Date().toISOString().replace(/\.\d{3}Z$/, ".000"),
    reqdExctnDt,
    statementDate: reqdExctnDt,
    fileSequence,
    organizerLines: organizerLines.map((l) => ({
      instrId: l.instrId,
      amountCents: l.amountCents,
      name: l.name,
      oib: l.oib,
      iban: l.iban,
      address: l.address,
    })),
    commissionLine:
      commissionAmountCents > 0
        ? { instrId: `PL-${ymd}-COMM`, amountCents: commissionAmountCents }
        : null,
  });

  const entryIds = includedRows.map((r) => r.entryId);
  const organizerPayoutCents = organizerLines.reduce(
    (s, l) => s + l.amountCents,
    0,
  );
  const gatewayCostCents = includedRows.reduce(
    (s, r) => s + r.gatewayCostCents,
    0,
  );
  const receivedTotalCents = includedRows.reduce(
    (s, r) => s + r.receivedCents,
    0,
  );
  const pleisNetCents = includedRows.reduce((s, r) => s + r.pleisNetCents, 0);

  const lineBreakdown = [
    ...organizerLines.map((l) => ({
      kind: "ORGANIZER",
      type: "ORGANIZER",
      companyOrganizer: l.companyOrganizer,
      companyOrganizerId: l.companyOrganizer,
      creditorName: l.creditorName,
      name: l.creditorName,
      creditorIban: l.creditorIban,
      iban: l.creditorIban,
      creditorOib: l.creditorOib,
      oib: l.creditorOib,
      amountCents: l.amountCents,
      instrId: l.instrId,
      entryIds: l.entryIds,
      breakdown: l.breakdown,
    })),
    ...(commissionAmountCents > 0
      ? [
          {
            kind: "COMMISSION",
            type: "COMMISSION",
            companyOrganizer: null,
            creditorName: pleis.operatingAccountName || pleis.name,
            name: pleis.operatingAccountName || pleis.name,
            creditorIban: normalizeIban(pleis.operatingIban),
            iban: normalizeIban(pleis.operatingIban),
            creditorOib: pleis.operatingAccountOib || pleis.oib,
            oib: pleis.operatingAccountOib || pleis.oib,
            amountCents: commissionAmountCents,
            instrId: `PL-${ymd}-COMM`,
            entryIds: [],
            breakdown: [],
          },
        ]
      : []),
  ];

  const statementDoc = {
    schemaVersion: 5,
    batchReference,
    status: "PENDING",
    currency: "EUR",
    totalAmountCents: built.ctrlSumCents,
    organizerPayoutCents,
    organizerNetTotalCents: organizerPayoutCents,
    pleisNetCents,
    pleisNetTotalCents: pleisNetCents,
    gatewayCostCents,
    receivedTotalCents,
    lineCount: built.nbOfTxs,
    transactionCount: entryIds.length,
    periodStart,
    periodEnd,
    entryIds,
    lines: lineBreakdown,
    lineBreakdown,
    entryBreakdown: includedRows.map((r) => ({
      entryId: r.entryId,
      module: r.module,
      receivedCents: r.receivedCents,
      organizerNetCents: r.organizerNetCents,
      pleisNetCents: r.pleisNetCents,
      gatewayCostCents: r.gatewayCostCents,
    })),
    incompleteOrganizers: [...incompleteMap.values()],
    promotedHeldCount: toPromote.length,
    ratesSnapshot: rates,
    msgId,
    fileName: built.fileName,
    fileSequence,
    pain001Xml: built.xml,
    pain001Hash: hashXml(built.xml),
    xmlHash: hashXml(built.xml),
    pain001StorageKey: built.fileName,
    exportedAt: new Date(),
    generatedBy: actor,
    generatedAt: new Date(),
    notes: notes || "",
    audit: [
      {
        action: "GENERATE",
        actor,
        at: new Date(),
        detail: {
          transactionCount: entryIds.length,
          lineCount: built.nbOfTxs,
          promotedHeldCount: toPromote.length,
          incompleteOrganizerCount: incompleteMap.size,
        },
      },
    ],
  };

  const attachResult = await PaymentLedgerEntry.updateMany(
    {
      _id: { $in: entryIds },
      statementId: null,
      payoutStatus: "PENDING",
    },
    {
      $set: {
        statementId: batchReference,
        payoutBatchId: batchReference,
      },
    },
  );

  if (
    attachResult.modifiedCount != null &&
    attachResult.modifiedCount < entryIds.length
  ) {
    await PaymentLedgerEntry.updateMany(
      { statementId: batchReference },
      { $set: { statementId: null, payoutBatchId: null } },
    );
    const err = new Error("statement_attach_race");
    err.code = "STATEMENT_ATTACH_RACE";
    err.statusCode = 409;
    throw err;
  }

  try {
    const created = await PayoutBatch.create(statementDoc);
    const obj = created.toObject ? created.toObject() : created;
    const { pain001Xml, ...rest } = obj;
    return {
      empty: false,
      statement: rest,
      fileName: built.fileName,
      incompleteOrganizers: [...incompleteMap.values()],
    };
  } catch (err) {
    await PaymentLedgerEntry.updateMany(
      { statementId: batchReference },
      { $set: { statementId: null, payoutBatchId: null } },
    );
    throw err;
  }
}

async function listStatements({
  limit = 50,
  skip = 0,
  includeCancelled = false,
} = {}) {
  const match = includeCancelled ? {} : { status: { $ne: "CANCELLED" } };
  const [items, total] = await Promise.all([
    PayoutBatch.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(Number(limit) || 50, 200))
      .select("-pain001Xml")
      .lean(),
    PayoutBatch.countDocuments(match),
  ]);
  return { items, total };
}

async function getStatement(idOrRef, { includeXml = false } = {}) {
  const q = mongoose.isValidObjectId(idOrRef)
    ? { $or: [{ _id: idOrRef }, { batchReference: idOrRef }] }
    : { batchReference: idOrRef };
  const select = includeXml ? undefined : "-pain001Xml";
  const doc = await PayoutBatch.findOne(q).select(select).lean();
  if (!doc) {
    const err = new Error("statement_not_found");
    err.code = "STATEMENT_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

async function downloadPain001(idOrRef) {
  const doc = await getStatement(idOrRef, { includeXml: true });
  if (!doc.pain001Xml) {
    const err = new Error("pain001_missing");
    err.code = "PAIN001_MISSING";
    err.statusCode = 404;
    throw err;
  }
  return {
    fileName: doc.fileName || `${doc.batchReference}.xml`,
    xml: doc.pain001Xml,
    contentType: "application/xml",
    statement: {
      batchReference: doc.batchReference,
      status: doc.status,
      msgId: doc.msgId,
      pain001Hash: doc.pain001Hash || doc.xmlHash,
    },
  };
}

async function confirmStatement(idOrRef, actorOrOpts) {
  const actorId =
    typeof actorOrOpts === "object" && actorOrOpts != null
      ? actorOrOpts.actorId || actorOrOpts.userId
      : actorOrOpts;
  const doc = await getStatement(idOrRef, { includeXml: false });
  applyConfirmTransition(doc, { actorId });
  const at = new Date();

  await PaymentLedgerEntry.updateMany(
    { statementId: doc.batchReference },
    { $set: ledgerConfirmPatch(at) },
  );

  return PayoutBatch.findByIdAndUpdate(
    doc._id,
    {
      $set: {
        status: "PAID",
        confirmedAt: at,
        confirmedBy: actorId || null,
      },
      $push: {
        audit: {
          action: "CONFIRM",
          actor: actorId || null,
          at,
          detail: { transactionCount: doc.transactionCount },
        },
      },
    },
    { new: true },
  )
    .select("-pain001Xml")
    .lean();
}

async function cancelStatement(idOrRef, actorOrOpts) {
  const actorId =
    typeof actorOrOpts === "object" && actorOrOpts != null
      ? actorOrOpts.actorId || actorOrOpts.userId
      : actorOrOpts;
  const doc = await getStatement(idOrRef, { includeXml: false });
  applyCancelTransition(doc, { actorId });
  const at = new Date();

  await PaymentLedgerEntry.updateMany(
    { statementId: doc.batchReference },
    { $set: ledgerCancelPatch() },
  );

  return PayoutBatch.findByIdAndUpdate(
    doc._id,
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: at,
        cancelledBy: actorId || null,
      },
      $push: {
        audit: {
          action: "CANCEL",
          actor: actorId || null,
          at,
          detail: { transactionCount: doc.transactionCount },
        },
      },
    },
    { new: true },
  )
    .select("-pain001Xml")
    .lean();
}

async function excludeLedgerEntry(entryId, { reason, userId, actorId } = {}) {
  if (!reason || !String(reason).trim()) {
    const err = new Error("exclusion_reason_required");
    err.code = "REASON_REQUIRED";
    err.statusCode = 400;
    throw err;
  }
  const entry = await PaymentLedgerEntry.findById(entryId);
  if (!entry) {
    const err = new Error("ledger_entry_not_found");
    err.code = "ENTRY_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }
  if (entry.payoutStatus !== "PENDING" || entry.statementId) {
    const err = new Error("exclude_not_allowed");
    err.code = "EXCLUDE_NOT_ALLOWED";
    err.statusCode = 409;
    err.payoutStatus = entry.payoutStatus;
    err.statementId = entry.statementId;
    throw err;
  }
  entry.payoutStatus = "EXCLUDED";
  entry.excludedAt = new Date();
  entry.excludedBy = userId || actorId || null;
  entry.exclusionReason = String(reason).trim();
  await entry.save();
  return entry.toObject();
}

module.exports = {
  parseOrganizerAddress,
  loadOrganizerCreditor,
  loadCommissionRates,
  generateStatement,
  listStatements,
  getStatement,
  downloadPain001,
  confirmStatement,
  cancelStatement,
  excludeLedgerEntry,
  hashXml,
  shouldPromoteHeldToPending,
};
