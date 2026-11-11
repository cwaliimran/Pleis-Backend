#!/usr/bin/env node
/**
 * Requirement Set #146 — "To go" is no longer a delivery destination.
 *
 *   - delivery options with deliveryMethod "toGo"  → no destination (null); the operator is
 *     asked to choose table or counter in Order settings (shown as "Choose destination").
 *   - venue in-app ordering settings deliveryMethods.toGo → false
 *   - OPEN orders whose pickupType is to-go → no destination (null). Closed orders keep
 *     their history. No order is silently reassigned to a table.
 *
 * Usage:  NODE_ENV=dev node backend/scripts/migrateToGoDestinations.js [--apply]
 * Without --apply it only reports what it would change (dry run).
 */
const path = require("path");
const NODE_ENV = process.env.NODE_ENV || "dev";
require("dotenv").config({ path: path.join(__dirname, "..", "..", `.env.${NODE_ENV}`), override: true });
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const TOGO = { $in: ["toGo", "togo", "TOGO", "to_go"] };
const CLOSED = ["completed", "cancelled", "canceled", "rejected", "delivered", "refunded"];

(async () => {
  await mongoose.connect(process.env.BASE_URL);
  const db = mongoose.connection.db;
  const plan = {
    deliveryOptions: await db.collection("deliveryoptions").countDocuments({ deliveryMethod: TOGO }),
    organizations: await db.collection("organizations").countDocuments({ "inAppOrderingSettings.deliveryMethods.toGo": true }),
    openOrders: await db.collection("orders").countDocuments({ pickupType: TOGO, status: { $nin: CLOSED } }),
  };
  console.log(`[#146] ${APPLY ? "APPLYING" : "DRY RUN"} on ${NODE_ENV}:`, plan);
  if (APPLY) {
    const r1 = await db.collection("deliveryoptions").updateMany({ deliveryMethod: TOGO }, { $set: { deliveryMethod: null } });
    const r2 = await db.collection("organizations").updateMany(
      { "inAppOrderingSettings.deliveryMethods.toGo": true },
      { $set: { "inAppOrderingSettings.deliveryMethods.toGo": false } }
    );
    const r3 = await db.collection("orders").updateMany({ pickupType: TOGO, status: { $nin: CLOSED } }, { $set: { pickupType: null } });
    console.log("[#146] updated:", { deliveryOptions: r1.modifiedCount, organizations: r2.modifiedCount, openOrders: r3.modifiedCount });
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
