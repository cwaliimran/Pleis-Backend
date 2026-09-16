/**
 * Off-app fiscalization batch (Payout §3.7).
 * Ordering paid outside Pleis (cash / external): no pain.001;
 * on confirm → Billko commission eRačun + mark off-app fiscalized.
 */

const mongoose = require("mongoose");
const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const OffAppFiscalBatch = require("./OffAppFiscalBatch.model");
const {
  defaultCommissionRates,
  ratesFromSubscriptionCommissions,
  splitLedgerEntry,
  clampRate,
} = require("./commissionSplit");
const {
  buildCommissionInvoicePayload,
  isBillkoFiscalizeEnabled,
  centsToEur,
} = require("./commissionInvoiceBuilder");
const {
  persistCommissionInvoice,
} = require("./fiscalizeService");

const OFF_APP_METHODS = new Set(["cash", "external", "pos", "offapp"]);

function batchReference() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OFFAPP-${ymd}-${rand}`;
}

function endOfDayZagreb(endDay) {
  const s = String(endDay).slice(0, 10);
  return new Date(`${s}T23:59:59.999Z`);
}

function startOfDayZagreb(day) {
  const s = String(day).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

async function loadCommissionRates() {
  try {
    const SubscriptionSettings = require("../../subscriptions/SubscriptionSettings");
    const doc = await SubscriptionSettings.findOne({})
      .select("commissions")
      .lean();
    if (doc?.commissions) {
      const base = ratesFromSubscriptionCommissions(doc.commissions);
      return {
        ...base,
        offAppOrdering: clampRate(
          doc.commissions.offAppOrderingCommission ??
            process.env.PLEIS_OFFAPP_ORDERING_COMMISSION ??
            base.ordering,
        ),
      };
    }
  } catch (_) {
    /* optional */
  }
  const base = defaultCommissionRates();
  return {
    ...base,
    offAppOrdering: clampRate(
      process.env.PLEIS_OFFAPP_ORDERING_COMMISSION ?? base.ordering,
    ),
  };
}

function isOffAppEntry(entry) {
  if (entry.paymentChannel === "offapp") return true;
  if (entry.offAppFiscalizationStatus) return true;
  const method = String(entry.paymentMethod || "").toLowerCase();
  return OFF_APP_METHODS.has(method);
}

/**
 * Eligible for a new off-app batch: ORDERING, off-app channel/method,
 * not yet in an off-app batch, off-app fiscalization not done.
 */
function offAppEligibleQuery(periodStart, periodEnd) {
  return {
    module: "ORDERING",
    statementId: null,
    offAppBatchId: null,
    capturedAt: { $gte: periodStart, $lte: periodEnd },
    $and: [
      {
        $or: [
          { paymentChannel: "offapp" },
          { paymentMethod: { $in: [...OFF_APP_METHODS] } },
        ],
      },
      {
        $or: [
          { offAppFiscalizationStatus: { $exists: false } },
          { offAppFiscalizationStatus: null },
          { offAppFiscalizationStatus: "NOT_FISCALIZED" },
        ],
      },
    ],
  };
}

async function generateOffAppBatch({ endDay, periodStartDay, actorId, notes }) {
  if (!endDay) {
    const err = new Error("end_day_required");
    err.statusCode = 400;
    throw err;
  }
  const pending = await OffAppFiscalBatch.findOne({ status: "PENDING" }).lean();
  if (pending) {
    const err = new Error("offapp_pending_batch_exists");
    err.statusCode = 409;
    err.existing = pending.batchReference;
    throw err;
  }

  const periodEnd = endOfDayZagreb(endDay);
  const periodStart = periodStartDay
    ? startOfDayZagreb(periodStartDay)
    : new Date(0);
  const rates = await loadCommissionRates();
  const offAppRates = {
    ...rates,
    ordering: rates.offAppOrdering ?? rates.ordering,
  };

  const entries = await PaymentLedgerEntry.find(
    offAppEligibleQuery(periodStart, periodEnd),
  ).lean();

  if (!entries.length) {
    return { empty: true, periodStart, periodEnd };
  }

  const byOrg = new Map();
  let orderGross = 0;
  let commissionTotal = 0;

  for (const entry of entries) {
    if (!isOffAppEntry(entry) && entry.paymentChannel !== "offapp") {
      // paymentMethod match already in query
    }
    const split = splitLedgerEntry(entry, offAppRates);
    const billable = Math.max(
      0,
      Math.round(Number(split.receivedCents) || 0) -
        Math.round(Number(split.organizerNetCents) || 0),
    );
    orderGross += Math.round(Number(split.receivedCents) || 0);
    commissionTotal += billable;
    const orgKey = String(entry.companyOrganizer || "");
    const prev = byOrg.get(orgKey) || {
      companyOrganizerId: orgKey,
      orderGrossCents: 0,
      commissionCents: 0,
      entryIds: [],
    };
    prev.orderGrossCents += Math.round(Number(split.receivedCents) || 0);
    prev.commissionCents += billable;
    prev.entryIds.push(entry._id);
    byOrg.set(orgKey, prev);
  }

  const ref = batchReference();
  const organizerLines = [...byOrg.values()];
  const entryIds = entries.map((e) => e._id);

  const batch = await OffAppFiscalBatch.create({
    batchReference: ref,
    status: "PENDING",
    periodStart,
    periodEnd,
    orderGrossCents: orderGross,
    commissionTotalCents: commissionTotal,
    lineCount: entries.length,
    entryIds,
    organizerLines,
    ratesSnapshot: offAppRates,
    generatedBy: actorId || null,
    notes: notes || "",
    audit: [
      {
        action: "GENERATE",
        actor: actorId || null,
        at: new Date(),
        detail: { lineCount: entries.length },
      },
    ],
  });

  await PaymentLedgerEntry.updateMany(
    { _id: { $in: entryIds } },
    {
      $set: {
        offAppBatchId: ref,
        offAppFiscalizationStatus: "NOT_FISCALIZED",
        paymentChannel: "offapp",
        // Keep out of in-app payout selection
        payoutStatus: "EXCLUDED",
        exclusionReason: "OFF_APP_PAYMENT",
        excludedAt: new Date(),
      },
    },
  );

  return {
    empty: false,
    batch: batch.toObject ? batch.toObject() : batch,
  };
}

async function listOffAppBatches({ limit = 50, skip = 0, includeCancelled = false } = {}) {
  const filter = includeCancelled ? {} : { status: { $ne: "CANCELLED" } };
  const [items, total] = await Promise.all([
    OffAppFiscalBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    OffAppFiscalBatch.countDocuments(filter),
  ]);
  return { items, total };
}

async function getOffAppBatch(idOrRef) {
  const q = mongoose.isValidObjectId(idOrRef)
    ? { $or: [{ _id: idOrRef }, { batchReference: idOrRef }] }
    : { batchReference: idOrRef };
  const batch = await OffAppFiscalBatch.findOne(q).lean();
  if (!batch) {
    const err = new Error("offapp_batch_not_found");
    err.statusCode = 404;
    throw err;
  }
  return batch;
}

async function cancelOffAppBatch(idOrRef, { actorId } = {}) {
  const batch = await getOffAppBatch(idOrRef);
  if (batch.status !== "PENDING") {
    const err = new Error("offapp_batch_not_pending");
    err.statusCode = 409;
    throw err;
  }
  const at = new Date();
  await PaymentLedgerEntry.updateMany(
    { offAppBatchId: batch.batchReference },
    {
      $set: {
        offAppBatchId: null,
        offAppFiscalizationStatus: null,
      },
    },
  );
  return OffAppFiscalBatch.findByIdAndUpdate(
    batch._id,
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: at,
        cancelledBy: actorId || null,
      },
      $push: {
        audit: { action: "CANCEL", actor: actorId || null, at },
      },
    },
    { new: true },
  ).lean();
}

async function confirmOffAppBatch(idOrRef, { actorId, forceLive = false } = {}) {
  const batch = await getOffAppBatch(idOrRef);
  if (batch.status !== "PENDING") {
    const err = new Error("offapp_batch_not_pending");
    err.statusCode = 409;
    throw err;
  }

  const live = forceLive === true || isBillkoFiscalizeEnabled();
  const rates = batch.ratesSnapshot || (await loadCommissionRates());
  const offAppRates = {
    ...defaultCommissionRates(),
    ...rates,
    ordering: rates.offAppOrdering ?? rates.ordering,
  };

  const entries = await PaymentLedgerEntry.find({
    _id: { $in: batch.entryIds },
  }).lean();

  const byOrg = new Map();
  for (const entry of entries) {
    const split = splitLedgerEntry(entry, offAppRates);
    const billable = Math.max(
      0,
      Math.round(Number(split.receivedCents) || 0) -
        Math.round(Number(split.organizerNetCents) || 0),
    );
    const orgKey = String(entry.companyOrganizer || "");
    const prev = byOrg.get(orgKey) || {
      companyOrganizerId: orgKey,
      organizationId: entry.organization,
      entryIds: [],
      byModule: { ORDERING: 0 },
      billableCommissionCents: 0,
    };
    prev.entryIds.push(entry._id);
    prev.byModule.ORDERING += billable;
    prev.billableCommissionCents += billable;
    byOrg.set(orgKey, prev);
  }

  const commissionInvoiceIds = [];
  const organizerResults = [];
  const User = mongoose.model("User");

  for (const group of byOrg.values()) {
    if (group.billableCommissionCents <= 0) {
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        {
          $set: {
            offAppFiscalizationStatus: "FISCALIZED",
            fiscalizedAt: new Date(),
          },
        },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        skipped: true,
        reason: "zero_commission",
      });
      continue;
    }

    const orderNumber = `OFFCOMM-${batch.batchReference}-${String(
      group.companyOrganizerId,
    ).slice(-8)}`;
    const user = await User.findById(group.companyOrganizerId)
      .select("firstName lastName email companyDetails")
      .lean();
    if (!user) {
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        { $set: { offAppFiscalizationStatus: "FISCALIZATION_FAILED" } },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        failed: true,
        reason: "organizer_not_found",
      });
      continue;
    }

    const payload = buildCommissionInvoicePayload({
      orderNumber,
      user,
      statementOrBatchRef: batch.batchReference,
      moduleLines: Object.entries(group.byModule).map(
        ([module, commissionCents]) => ({ module, commissionCents }),
      ),
    });

    if (!live) {
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        {
          $set: {
            offAppFiscalizationStatus: "FISCALIZED",
            fiscalizedAt: new Date(),
          },
        },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        dryRun: true,
        orderNumber,
        billableCommissionEur: centsToEur(group.billableCommissionCents),
      });
      continue;
    }

    try {
      const { createInvoice } = require("../billko/billkoClient");
      const { getPleisBillkoApiKey } = require("../billko/billkoCredentials");
      const remote = await createInvoice(getPleisBillkoApiKey(), payload);
      const invoice = await persistCommissionInvoice({
        orderNumber,
        orderId: group.entryIds[0],
        companyOrganizer: group.companyOrganizerId,
        organization: group.organizationId,
        payload,
        remote,
      });
      commissionInvoiceIds.push(invoice._id);
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        {
          $set: {
            offAppFiscalizationStatus: "FISCALIZED",
            fiscalizedAt: new Date(),
          },
          $addToSet: { invoiceIds: invoice._id },
        },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        ok: true,
        invoiceId: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (err) {
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        { $set: { offAppFiscalizationStatus: "FISCALIZATION_FAILED" } },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        failed: true,
        reason: err.message,
      });
    }
  }

  const at = new Date();
  const updated = await OffAppFiscalBatch.findByIdAndUpdate(
    batch._id,
    {
      $set: {
        status: "CONFIRMED",
        confirmedAt: at,
        confirmedBy: actorId || null,
        commissionInvoiceIds,
      },
      $push: {
        audit: {
          action: live ? "CONFIRM" : "CONFIRM_DRY_RUN",
          actor: actorId || null,
          at,
          detail: { organizerResults, live },
        },
      },
    },
    { new: true },
  ).lean();

  return { live, dryRun: !live, batch: updated, organizerResults };
}

module.exports = {
  generateOffAppBatch,
  listOffAppBatches,
  getOffAppBatch,
  cancelOffAppBatch,
  confirmOffAppBatch,
  offAppEligibleQuery,
  isOffAppEntry,
  OFF_APP_METHODS,
  batchReference,
};
