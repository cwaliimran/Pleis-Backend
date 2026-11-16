#!/usr/bin/env node
/**
 * Requirement Set #10 — every captured payment has exactly one transaction row.
 *
 * The transaction list reads the payment ledger (PaymentLedgerEntry, unique on
 * orderId + module). Payments captured before the ledger existed, and venue
 * payments marked paid by staff, may have no row. This script:
 *
 *   1. writes the missing row for every paid order with money on it:
 *      menu orders, ticketing orders and reservations (idempotent writer);
 *   2. moves ordering rows paid at the venue (cash, card terminal, Other) off
 *      the payout track when they were filed on it and are not yet in a
 *      statement (Payout v10 §3.7). Rows already in a statement are reported,
 *      never changed.
 *
 * Usage:  NODE_ENV=dev node backend/scripts/backfillPaymentLedger.js [--apply]
 * Without --apply it only reports what it would do (dry run).
 */
const path = require("path");
const NODE_ENV = process.env.NODE_ENV || "dev";
require("dotenv").config({ path: path.join(__dirname, "..", "..", `.env.${NODE_ENV}`), override: true });
const mongoose = require("mongoose");
const PaymentLedgerEntry = require("../commonModules/paymentsIntegrations/ledger/PaymentLedgerEntry.model");
const {
  writePaymentLedgerEntry,
  EXCLUSION_REASONS,
} = require("../commonModules/paymentsIntegrations/ledger/ledgerWriter");

const APPLY = process.argv.includes("--apply");
const OFF_APP = ["cash", "cardTerminal", "other"];

(async () => {
  await mongoose.connect(process.env.BASE_URL);
  const db = mongoose.connection.db;
  const has = async (orderId, module) =>
    Boolean(await PaymentLedgerEntry.exists({ orderId, module }));
  const creatorOf = new Map();
  const companyOf = async (orgId) => {
    if (!orgId) return undefined;
    const key = String(orgId);
    if (!creatorOf.has(key)) {
      const org = await db.collection("organizations").findOne({ _id: orgId }, { projection: { creator: 1 } });
      creatorOf.set(key, org?.creator);
    }
    return creatorOf.get(key);
  };

  const missing = [];

  // Menu orders: received = amount due + voucher part (same as the finalizer).
  for await (const o of db.collection("menuorders").find(
    { paymentStatus: "paid" },
    { projection: { totalPrice: 1, priceBreakdown: 1, paymentMethod: 1, organization: 1, user: 1, transactionId: 1, paidAt: 1, updatedAt: 1 } },
  )) {
    const voucher = Number(o.priceBreakdown?.voucherDiscount || 0);
    const amount = Number(o.totalPrice || 0) + voucher;
    if (amount <= 0 || (await has(o._id, "ORDERING"))) continue;
    missing.push({
      orderId: o._id,
      orderType: "menuorders",
      module: "ORDERING",
      organization: o.organization,
      companyOrganizer: await companyOf(o.organization),
      user: o.user,
      amount,
      tipAmount: Number(o.priceBreakdown?.tip || 0),
      paymentStatus: "paid",
      paymentMethod: voucher > 0 && !(Number(o.totalPrice) > 0) ? "voucher" : o.paymentMethod,
      providerTransactionId: o.transactionId || null,
      capturedAt: o.paidAt || o.updatedAt,
      notes: "backfill #10",
    });
  }

  for await (const t of db.collection("ticketingorders").find(
    { "paymentDetails.paymentStatus": { $in: ["paid", "refunded"] } },
    { projection: { orderPricing: 1, organization: 1, companyOrganizer: 1, user: 1, paymentDetails: 1, updatedAt: 1 } },
  )) {
    const amount = Number(t.orderPricing?.total || 0);
    if (amount <= 0 || (await has(t._id, "TICKETING"))) continue;
    missing.push({
      orderId: t._id,
      orderType: "ticketingbookings",
      module: "TICKETING",
      organization: t.organization,
      companyOrganizer: t.companyOrganizer,
      user: t.user,
      amount,
      paymentStatus: "paid",
      paymentMethod: t.paymentDetails?.paymentMethod || "card",
      providerTransactionId: t.paymentDetails?.transactionId || null,
      capturedAt: t.updatedAt,
      notes: "backfill #10",
    });
  }

  for await (const r of db.collection("userreservations").find(
    { "paymentDetails.paymentStatus": { $in: ["paid", "refunded"] } },
    { projection: { amount: 1, organizationId: 1, companyOrganizer: 1, userId: 1, paymentDetails: 1, paidAt: 1, updatedAt: 1 } },
  )) {
    const amount = Number(r.amount || 0);
    if (amount <= 0 || (await has(r._id, "RESERVATION"))) continue;
    missing.push({
      orderId: r._id,
      orderType: "userreservations",
      module: "RESERVATION",
      organization: r.organizationId,
      companyOrganizer: r.companyOrganizer,
      user: r.userId,
      amount,
      paymentStatus: "paid",
      paymentMethod: r.paymentDetails?.paymentMethod || "card",
      providerTransactionId: r.paymentDetails?.transactionId || null,
      capturedAt: r.paidAt || r.updatedAt,
      notes: "backfill #10",
    });
  }

  // Venue payments filed on the payout track.
  const misfiled = await PaymentLedgerEntry.find({
    module: "ORDERING",
    paymentMethod: { $in: OFF_APP },
    paymentChannel: { $ne: "offapp" },
  })
    .select("_id orderId paymentMethod statementId payoutStatus")
    .lean();
  const movable = misfiled.filter((e) => !e.statementId && e.payoutStatus !== "PAID");
  const locked = misfiled.filter((e) => e.statementId || e.payoutStatus === "PAID");

  console.log(`[#10] ${APPLY ? "APPLYING" : "DRY RUN"} on ${NODE_ENV}:`, {
    missingRows: {
      ORDERING: missing.filter((m) => m.module === "ORDERING").length,
      TICKETING: missing.filter((m) => m.module === "TICKETING").length,
      RESERVATION: missing.filter((m) => m.module === "RESERVATION").length,
    },
    offAppOnPayoutTrack: movable.length,
    offAppAlreadyInStatement: locked.map((e) => String(e._id)),
  });

  if (APPLY) {
    let created = 0;
    for (const event of missing) {
      const r = await writePaymentLedgerEntry(event);
      if (r.created) created += 1;
    }
    const moved = await PaymentLedgerEntry.updateMany(
      { _id: { $in: movable.map((e) => e._id) }, statementId: null },
      {
        $set: {
          paymentChannel: "offapp",
          payoutStatus: "EXCLUDED",
          exclusionReason: EXCLUSION_REASONS.OFF_APP_PAYMENT,
          excludedAt: new Date(),
          offAppFiscalizationStatus: "NOT_FISCALIZED",
        },
      },
    );
    console.log("[#10] done:", { created, movedToOffApp: moved.modifiedCount });
  }

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("[#10] failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
