#!/usr/bin/env node
/**
 * Backfill 120×120 WebP map markers for existing organizations.
 *
 * Uses basicInfo.media.logo → basicInfo.media.logoMarker
 *
 * Usage:
 *   NODE_ENV=prodtest node backend/scripts/backfillOrganizationMapMarkers.js
 *   NODE_ENV=prodtest node backend/scripts/backfillOrganizationMapMarkers.js --limit=20
 *   NODE_ENV=prodtest node backend/scripts/backfillOrganizationMapMarkers.js --dry-run
 *   NODE_ENV=prodtest node backend/scripts/backfillOrganizationMapMarkers.js --force   # regenerate even if marker exists
 *   NODE_ENV=prodtest node backend/scripts/backfillOrganizationMapMarkers.js --concurrency=3
 *
 * Env:
 *   LIMIT, FORCE=1, DRY_RUN=1, CONCURRENCY (defaults below)
 */

"use strict";

const path = require("path");
const moduleAlias = require("module-alias");

const NODE_ENV = process.env.NODE_ENV || "prodtest";
process.env.NODE_ENV = NODE_ENV;

const envPath = path.join(__dirname, "..", "..", `.env.${NODE_ENV}`);
// override so a shell/http BASE_URL cannot shadow the Mongo URI in .env.prodtest
require("dotenv").config({ path: envPath, override: true });

// If multiple BASE_URL lines exist, prefer the mongodb:// one from the file
(function preferMongoBaseUrl() {
  try {
    const text = require("fs").readFileSync(envPath, "utf8");
    const mongoLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^BASE_URL=mongodb(\+srv)?:\/\//i.test(l));
    if (mongoLine) {
      process.env.BASE_URL = mongoLine.slice("BASE_URL=".length).trim();
    }
  } catch {
    // keep dotenv value
  }
})();

const aliases = require("../../aliasConfig/pathAliases.config");
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(__dirname, "..", "..", target));
}
require("module-alias/register");

const mongoose = require("mongoose");
const Organizations = require("../commonModules/organizations/Organization");
const {
  toBlobName,
  createMapMarkerFromSource,
  deleteBlobQuiet,
} = require("../helperUtils/mapMarkerImage");

function parseArgs(argv) {
  const opts = {
    limit: Number(process.env.LIMIT) || 0,
    force: process.env.FORCE === "1",
    dryRun: process.env.DRY_RUN === "1",
    concurrency: Number(process.env.CONCURRENCY) || 100,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.slice(8)) || 0;
    else if (arg.startsWith("--concurrency="))
      opts.concurrency = Math.max(1, Number(arg.slice(14)) || 100);
  }
  return opts;
}

async function connect() {
  const uri = process.env.BASE_URL;
  if (!uri) throw new Error("BASE_URL (Mongo URI) missing in .env." + NODE_ENV);
  await mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
  });
  console.log("Mongo connected:", mongoose.connection.host);
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

async function processOrganization(org, { dryRun, force }) {
  const name = org.basicInfo?.name || "(no name)";
  const media = org.basicInfo?.media || {};
  const id = String(org._id);

  const logo = toBlobName(media.logo);
  if (!logo) {
    return { id, name, status: "skip-no-logo" };
  }

  if (!force && media.logoMarker && String(media.logoMarker).trim()) {
    return { id, name, status: "skip-has-marker", marker: media.logoMarker };
  }

  if (dryRun) {
    return {
      id,
      name,
      status: "dry-run",
      source: logo,
      wouldReplace: media.logoMarker || null,
    };
  }

  try {
    const logoMarker = await createMapMarkerFromSource(logo);
    if (!logoMarker) {
      return { id, name, status: "fail-create", source: logo };
    }

    if (media.logoMarker && toBlobName(media.logoMarker) !== logoMarker) {
      await deleteBlobQuiet(media.logoMarker);
    }

    await Organizations.updateOne(
      { _id: org._id },
      { $set: { "basicInfo.media.logoMarker": logoMarker } }
    );

    return {
      id,
      name,
      status: "ok",
      source: logo,
      marker: logoMarker,
    };
  } catch (err) {
    return {
      id,
      name,
      status: "error",
      error: err.message,
      source: logo,
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log("backfillOrganizationMapMarkers", { NODE_ENV, ...opts });

  // Quick Azure env check
  for (const k of [
    "AZURE_STORAGE_ACCOUNT_NAME",
    "AZURE_STORAGE_ACCOUNT_KEY",
    "AZURE_STORAGE_CONTAINER_NAME",
    "AZURE_STORAGE_BASE_URL",
  ]) {
    if (!process.env[k]) console.warn("WARN missing env:", k);
  }

  await connect();

  const filter = {
    status: { $ne: "deleted" },
    "basicInfo.media.logo": { $exists: true, $nin: [null, ""] },
  };
  if (!opts.force) {
    filter.$and = [
      {
        $or: [
          { "basicInfo.media.logoMarker": { $exists: false } },
          { "basicInfo.media.logoMarker": null },
          { "basicInfo.media.logoMarker": "" },
        ],
      },
    ];
  }

  let query = Organizations.find(filter)
    .select("_id basicInfo.name basicInfo.media")
    .sort({ updatedAt: -1 })
    .lean();

  if (opts.limit > 0) query = query.limit(opts.limit);

  const orgs = await query;
  console.log(`Found ${orgs.length} organization(s) to process`);

  const results = await mapPool(orgs, opts.concurrency, (org) =>
    processOrganization(org, opts)
  );

  const counts = {};
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (
      r.status === "ok" ||
      r.status === "dry-run" ||
      r.status === "error" ||
      r.status === "fail-create"
    ) {
      console.log(
        `${r.status.padEnd(14)} ${r.id}  ${r.name?.slice(0, 40)}  ${r.marker || r.source || r.error || ""}`
      );
    }
  }

  console.log("\nSummary:", counts);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
