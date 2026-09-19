/**
 * On-demand Fiscalize batch (Payout §3.6 / Billko §9.3 / §14.4).
 * Selects payoutStatus=PAID + fiscalizationStatus in (NOT_FISCALIZED, FISCALIZATION_FAILED).
 * Issues Pleis→organizer commission eRačun (one per organizer).
 * Live Billko only when BILLKO_FISCALIZE_ENABLED=true.
 */

const mongoose = require("mongoose");
const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const FiscalizeRun = require("./FiscalizeRun.model");
const BillkoInvoice = require("../../fiscalDocuments/models/BillkoInvoice.model");
const {
  defaultCommissionRates,
  ratesFromSubscriptionCommissions,
  splitLedgerEntry,
} = require("./commissionSplit");
const {
  buildCommissionInvoicePayload,
  isBillkoFiscalizeEnabled,
  centsToEur,
} = require("./commissionInvoiceBuilder");

function runReference() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FZ-${ymd}-${rand}`;
}

async function loadCommissionRates() {
  try {
    const SubscriptionSettings = require("../../subscriptions/SubscriptionSettings");
    const doc = await SubscriptionSettings.findOne({})
      .select("commissions")
      .lean();
    if (doc?.commissions) {
      return ratesFromSubscriptionCommissions(doc.commissions);
    }
  } catch (_) {
    /* settings model optional */
  }
  return defaultCommissionRates();
}

async function loadOrganizerUser(companyOrganizerId) {
  const User = mongoose.model("User");
  return User.findById(companyOrganizerId)
    .select("firstName lastName email companyDetails")
    .lean();
}

/**
 * Persist commission BillkoInvoice (seller = Pleis). Additive orderType "commission".
 */
async function persistCommissionInvoice({
  orderNumber,
  orderId,
  companyOrganizer,
  organization,
  payload,
  remote,
}) {
  const amount = payload.payment?.[0]?.amount || 0;
  return BillkoInvoice.findOneAndUpdate(
    { orderNumber, kind: "commission" },
    {
      $set: {
        kind: "commission",
        seller: "pleis",
        orderType: "commission",
        orderId,
        orderNumber,
        organization: organization || null,
        companyOrganizer,
        user: companyOrganizer,
        amount,
        currency: "EUR",
        taxRateLabels: (payload.products || [])
          .map((p) => p.taxRateLabels?.[0])
          .filter(Boolean),
        billkoId: remote?.id || remote?._id || "",
        invoiceNumber: remote?.invoiceNumber || "",
        fiscalizationNumber: remote?.fiscalizationNumber || "",
        fiscalProtectionCode:
          remote?.fiscalProtectionCode || remote?.zki || remote?.ZKI || "",
        invoicePreviewLink: remote?.invoicePreviewLink || "",
        status: remote?.fiscalizationNumber ? "fiscalized" : "created",
        rawResponse: { ...(remote || {}), products: payload.products },
        lastError: remote?.fiscalizationNumber
          ? ""
          : "invoice_created_but_not_fiscalized",
      },
    },
    { upsert: true, new: true },
  );
}

function selectFiscalizeQuery() {
  return {
    payoutStatus: "PAID",
    fiscalizationStatus: { $in: ["NOT_FISCALIZED", "FISCALIZATION_FAILED"] },
  };
}

/**
 * Group PAID entries by organizer and compute commission lines per module.
 */
function groupCommissionByOrganizer(entries, rates) {
  const byOrg = new Map();

  for (const entry of entries) {
    const orgKey = String(entry.companyOrganizer || "");
    if (!orgKey) continue;
    const split = splitLedgerEntry(entry, rates);
    const commissionCents = Math.max(0, Math.round(Number(split.pleisNetCents) || 0));
    // Commission invoice shows commission only — exclude gateway cost from billable
    // by using module commission = received - organizerNet - tip_pass parts.
    // pleisNet already = commissions - gateway; for eRačun we bill gross commission
    // before gateway: received - organizerNet.
    const billableCommission = Math.max(
      0,
      Math.round(Number(split.receivedCents) || 0) -
        Math.round(Number(split.organizerNetCents) || 0),
    );

    const prev = byOrg.get(orgKey) || {
      companyOrganizerId: orgKey,
      organizationId: entry.organization ? String(entry.organization) : null,
      entryIds: [],
      byModule: {},
      billableCommissionCents: 0,
      pleisNetCents: 0,
    };
    prev.entryIds.push(entry._id);
    const mod = entry.module || "ORDERING";
    prev.byModule[mod] = (prev.byModule[mod] || 0) + billableCommission;
    prev.billableCommissionCents += billableCommission;
    prev.pleisNetCents += commissionCents;
    byOrg.set(orgKey, prev);
  }

  return [...byOrg.values()];
}

async function fiscalizePaidOut({ actorId = null, notes = "", forceLive = false } = {}) {
  const live = forceLive === true || isBillkoFiscalizeEnabled();
  const rates = await loadCommissionRates();
  const entries = await PaymentLedgerEntry.find(selectFiscalizeQuery()).lean();
  const ref = runReference();
  const groups = groupCommissionByOrganizer(entries, rates);

  const organizerResults = [];
  const commissionInvoiceIds = [];
  let fiscalizedCount = 0;
  let failedCount = 0;
  let skippedZero = 0;
  const fiscalizedEntryIds = [];
  const failedEntryIds = [];

  for (const group of groups) {
    const moduleLines = Object.entries(group.byModule)
      .filter(([, cents]) => cents > 0)
      .map(([module, commissionCents]) => ({ module, commissionCents }));

    if (!moduleLines.length || group.billableCommissionCents <= 0) {
      skippedZero += 1;
      // Still mark as FISCALIZED — nothing to invoice (0% rate)
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        {
          $set: {
            fiscalizationStatus: "FISCALIZED",
            fiscalizedAt: new Date(),
          },
        },
      );
      fiscalizedCount += group.entryIds.length;
      fiscalizedEntryIds.push(...group.entryIds);
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        skipped: true,
        reason: "zero_commission",
        entryCount: group.entryIds.length,
      });
      continue;
    }

    const orderNumber = `COMM-${ref}-${group.companyOrganizerId.slice(-8)}`;
    const user = await loadOrganizerUser(group.companyOrganizerId);
    if (!user) {
      failedCount += group.entryIds.length;
      failedEntryIds.push(...group.entryIds);
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        { $set: { fiscalizationStatus: "FISCALIZATION_FAILED" } },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        failed: true,
        reason: "organizer_not_found",
      });
      continue;
    }

    let payload;
    try {
      payload = buildCommissionInvoicePayload({
        orderNumber,
        user,
        statementOrBatchRef: ref,
        moduleLines,
        dateOfService: new Date(),
      });
    } catch (err) {
      failedCount += group.entryIds.length;
      failedEntryIds.push(...group.entryIds);
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        { $set: { fiscalizationStatus: "FISCALIZATION_FAILED" } },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        failed: true,
        reason: err.message,
      });
      continue;
    }

    if (!live) {
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        dryRun: true,
        orderNumber,
        billableCommissionEur: centsToEur(group.billableCommissionCents),
        moduleLines,
        entryCount: group.entryIds.length,
      });
      continue;
    }

    try {
      const { createInvoice } = require("../billko/billkoClient");
      const { getPleisBillkoApiKey } = require("../billko/billkoCredentials");
      const apiKey = getPleisBillkoApiKey();
      const remote = await createInvoice(apiKey, payload);
      const invoice = await persistCommissionInvoice({
        orderNumber,
        orderId: group.entryIds[0],
        companyOrganizer: group.companyOrganizerId,
        organization: group.organizationId,
        payload,
        remote,
      });
      commissionInvoiceIds.push(invoice._id);

      let paymentReport = null;
      try {
        const {
          reportPaymentForCommissionInvoice,
        } = require("./billkoB2bDocumentsService");
        paymentReport = await reportPaymentForCommissionInvoice(invoice);
      } catch (reportErr) {
        console.warn(
          "[fiscalize] lake payment report failed:",
          reportErr.message,
        );
        paymentReport = {
          failed: true,
          reason: reportErr.message,
        };
      }

      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        {
          $set: {
            fiscalizationStatus: "FISCALIZED",
            fiscalizedAt: new Date(),
          },
          $addToSet: { invoiceIds: invoice._id },
        },
      );
      fiscalizedCount += group.entryIds.length;
      fiscalizedEntryIds.push(...group.entryIds);
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        ok: true,
        invoiceId: String(invoice._id),
        billkoId: invoice.billkoId,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber,
        billableCommissionEur: centsToEur(group.billableCommissionCents),
        paymentReport,
      });
    } catch (err) {
      failedCount += group.entryIds.length;
      failedEntryIds.push(...group.entryIds);
      await PaymentLedgerEntry.updateMany(
        { _id: { $in: group.entryIds } },
        { $set: { fiscalizationStatus: "FISCALIZATION_FAILED" } },
      );
      organizerResults.push({
        companyOrganizerId: group.companyOrganizerId,
        failed: true,
        reason: err.message,
      });
    }
  }

  const status = !live
    ? "DRY_RUN"
    : failedCount > 0 && fiscalizedCount > 0
      ? "PARTIAL"
      : failedCount > 0
        ? "FAILED"
        : "COMPLETED";

  const run = await FiscalizeRun.create({
    runReference: ref,
    status,
    liveBillko: live,
    selectedCount: entries.length,
    fiscalizedCount,
    failedCount,
    skippedZeroCommissionCount: skippedZero,
    commissionInvoiceIds,
    organizerResults,
    entryIds: entries.map((e) => e._id),
    generatedBy: actorId || null,
    notes: notes || "",
  });

  return {
    run,
    live,
    selectedCount: entries.length,
    fiscalizedCount,
    failedCount,
    skippedZeroCommissionCount: skippedZero,
    organizerResults,
  };
}

async function listFiscalizeRuns({ limit = 50, skip = 0 } = {}) {
  const [items, total] = await Promise.all([
    FiscalizeRun.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FiscalizeRun.countDocuments({}),
  ]);
  return { items, total };
}

module.exports = {
  fiscalizePaidOut,
  listFiscalizeRuns,
  selectFiscalizeQuery,
  groupCommissionByOrganizer,
  persistCommissionInvoice,
  runReference,
};
