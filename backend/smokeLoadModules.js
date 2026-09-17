#!/usr/bin/env node
/**
 * Smoke-load routes + controllers + services + repos + related modules.
 * Catches require/import/syntax/alias errors without hitting HTTP or mutating data.
 *
 * Usage:
 *   NODE_ENV=prodtest node backend/smokeLoadModules.js
 *   npm run smoke:modules
 *
 * Flags:
 *   --verbose   list every successfully loaded file
 *   --routes    dump METHOD + path from Express router stacks
 *   --strict    exit 1 on orphan-module failures too (default: only route graph)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname; // backend/
const REPO_ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.includes("--verbose");
const DUMP_ROUTES = process.argv.includes("--routes");
const STRICT = process.argv.includes("--strict");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "coverage",
  "dist",
  "build",
  "uploads",
  "logs",
  "database_backups",
  "secretAssets",
  "tools",
  "assets",
]);

/** Standalone / side-effect scripts that must not be required */
const SKIP_FILES = [
  /[/\\]server\.js$/,
  /[/\\]smokeLoadModules\.js$/,
  /[/\\]findNonSendResponse\.js$/,
  /[/\\]checkTranslationKeys\.js$/,
  /[/\\]createAutoTester\.js$/,
  /ecosystem\.config/,
  /verifyMonriSuccessDummy\.js$/,
  /Dummy\.js$/,
  /Mock\.js$/,
  /[/\\].* copy[/\\]/i, // e.g. "usersManagement copy"
];

const INCLUDE_NAME =
  /(Routes?|Controller|Service|Repository|Repo|Model|Middleware|Validator|Validation|Formator|Formatter|Helper|Util|Schema|Factory|Mapper|Adapter|Handler|Job|Worker|Queue|Cron|Config|Policy|Guard|Strategy|Provider|Client|Gateway|Parser|Builder|Types?)\.js$/i;

const INCLUDE_DIR_HINT =
  /[/\\](routes|controllers|services|service|repositories|repos|models|middlewares|middleware|validators|validation|helpers|helperUtils|config|bullmq|shared|formator|formatter|utils)[/\\]/i;

require("dotenv").config({
  path: path.join(REPO_ROOT, `.env.${process.env.NODE_ENV || "dev"}`),
});

const moduleAlias = require("module-alias");
const aliases = require(path.join(REPO_ROOT, "aliasConfig/pathAliases.config"));
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(REPO_ROOT, target));
}
require("module-alias/register");

function walkJsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (/ copy$/i.test(entry.name)) continue;
      walkJsFiles(full, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    if (SKIP_FILES.some((re) => re.test(full))) continue;
    out.push(full);
  }
  return out;
}

function shouldLoad(filePath) {
  if (INCLUDE_NAME.test(filePath)) return true;
  if (INCLUDE_DIR_HINT.test(filePath)) return true;
  if (/[/\\](commonModules|admin|app|organizer|staff|controllers)[/\\]/.test(filePath)) {
    if (/[/\\](scripts|migrations|seeds|__tests__|test|tests|spec)[/\\]/i.test(filePath)) {
      return false;
    }
    return true;
  }
  return false;
}

/** Duplicate mongoose model registration when requiring alternate copies */
function isBenignError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/Cannot overwrite `.*` model once compiled/.test(msg)) return true;
  if (err && err.name === "OverwriteModelError") return true;
  return false;
}

function collectRouteStack(router, prefix = "", acc = []) {
  if (!router || !router.stack) return acc;
  for (const layer of router.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());
      const full = joinPath(prefix, layer.route.path);
      for (const method of methods) {
        acc.push({ method, path: full });
      }
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      const mount = layer.regexp ? layerRegexpToPath(layer.regexp) : "";
      collectRouteStack(layer.handle, joinPath(prefix, mount), acc);
    }
  }
  return acc;
}

function joinPath(a, b) {
  const left = (a || "").replace(/\/+$/, "");
  const right = (b || "").replace(/^\/+/, "");
  if (!left && !right) return "/";
  if (!left) return "/" + right;
  if (!right) return left || "/";
  return `${left}/${right}`;
}

function layerRegexpToPath(re) {
  const src = re && re.source ? re.source : "";
  const m = src.match(/\\\/((?:[A-Za-z0-9_\-]|\\\/)+)/g);
  if (!m) return "";
  return (
    "/" +
    m
      .map((s) => s.replace(/\\\//g, "/").replace(/^\//, ""))
      .join("/")
      .replace(/\/+/g, "/")
  );
}

function rel(p) {
  return path.relative(REPO_ROOT, p);
}

function shortErr(err) {
  return (err.message || String(err)).split("\n")[0];
}

const started = Date.now();
const criticalErrors = [];
const orphanErrors = [];
const ignoredErrors = [];
const loaded = [];

const ROUTE_ENTRYPOINTS = [
  { name: "routes", mount: "/api/v1", file: path.join(ROOT, "routes/index.js") },
  {
    name: "adminRoutes",
    mount: "/api/v1/admin",
    file: path.join(ROOT, "admin/routes/index.js"),
  },
  {
    name: "organizerRoutes",
    mount: "/api/v1/organizer",
    file: path.join(ROOT, "organizer/routes/index.js"),
  },
  {
    name: "appRoutes",
    mount: "/api/v1/app",
    file: path.join(ROOT, "routes/appRoutes.js"),
  },
  {
    name: "staffRoutes",
    mount: "/api/v1/app/staff",
    file: path.join(ROOT, "routes/staffRoutes.js"),
  },
  {
    name: "webhooksRoutes",
    mount: "/api/v1/webhooks",
    file: path.join(
      ROOT,
      "commonModules/paymentsIntegrations/paymentsWebhook/routes/webhookRoutes.js"
    ),
  },
];

console.log("🔥 smokeLoadModules");
console.log(`   NODE_ENV=${process.env.NODE_ENV || "(unset)"}`);
console.log(`   root=${rel(ROOT)}`);
console.log(`   mode=${STRICT ? "strict (orphans fail CI)" : "default (route graph is gate)"}`);
console.log("");

// Snapshot require.cache after routes → anything else is "orphan / unused mount"
console.log("── 1) Route entrypoints (critical) ──");
const discoveredRoutes = [];
for (const entry of ROUTE_ENTRYPOINTS) {
  const label = `${entry.name} → ${entry.mount}`;
  try {
    const mod = require(entry.file);
    loaded.push(entry.file);
    console.log(`  ✅ ${label}`);
    if (DUMP_ROUTES && mod && mod.stack) {
      discoveredRoutes.push(...collectRouteStack(mod, entry.mount));
    }
  } catch (err) {
    criticalErrors.push({ file: entry.file, phase: "route-entrypoint", err });
    console.log(`  ❌ ${label}`);
    console.log(`     ${shortErr(err)}`);
  }
}

const routeGraphFiles = new Set(Object.keys(require.cache));

console.log("");
console.log("── 2) Remaining services / repos / controllers / utils ──");

const allJs = walkJsFiles(ROOT);
const candidates = allJs.filter(shouldLoad).sort();

let okCount = 0;
let failCount = 0;
let alreadyCached = 0;
let ignoredCount = 0;

for (const file of candidates) {
  let resolved;
  try {
    resolved = require.resolve(file);
  } catch (err) {
    orphanErrors.push({ file, phase: "resolve", err });
    failCount++;
    console.log(`  ❌ ${rel(file)}`);
    console.log(`     ${shortErr(err)}`);
    continue;
  }

  if (require.cache[resolved]) {
    alreadyCached++;
    continue;
  }

  try {
    require(file);
    loaded.push(file);
    okCount++;
    if (VERBOSE) console.log(`  ✅ ${rel(file)}`);
  } catch (err) {
    if (isBenignError(err)) {
      ignoredCount++;
      ignoredErrors.push({ file, phase: "module-require", err });
      if (VERBOSE) {
        console.log(`  ↷ ${rel(file)} (benign: ${shortErr(err)})`);
      }
      continue;
    }
    failCount++;
    orphanErrors.push({ file, phase: "module-require", err });
    console.log(`  ❌ ${rel(file)}`);
    console.log(`     ${shortErr(err)}`);
  }
}

console.log(`  newly loaded: ${okCount}`);
console.log(`  already in route graph: ${alreadyCached}`);
console.log(`  ignored (mongoose overwrite etc.): ${ignoredCount}`);
console.log(`  failed: ${failCount}`);
console.log(`  candidates: ${candidates.length} / ${allJs.length} js files`);
console.log(`  route-graph modules in cache: ${routeGraphFiles.size}`);

if (DUMP_ROUTES) {
  console.log("");
  console.log("── Registered routes (approx) ──");
  const uniq = new Map();
  for (const r of discoveredRoutes) {
    uniq.set(`${r.method} ${r.path}`, r);
  }
  const list = [...uniq.values()].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
  );
  console.log(`  count: ${list.length}`);
  for (const r of list) {
    console.log(`  ${r.method.padEnd(7)} ${r.path}`);
  }
}

const ms = Date.now() - started;
console.log("");
console.log("── Summary ──");
console.log(`  duration: ${ms}ms`);
console.log(`  critical (route entrypoints): ${criticalErrors.length}`);
console.log(`  orphan / unused-mount failures: ${orphanErrors.length}`);
console.log(`  ignored: ${ignoredErrors.length}`);

if (criticalErrors.length) {
  console.log("");
  console.log("── CRITICAL failures ──");
  for (const { file, phase, err } of criticalErrors) {
    console.log(`\n[${phase}] ${rel(file)}`);
    console.log(err.stack || err.message);
  }
}

if (orphanErrors.length) {
  console.log("");
  console.log(
    "── Orphan / unused-mount failures (not pulled by live route trees) ──"
  );
  console.log(
    "   These files are not required by the 6 server entry routers."
  );
  console.log(
    "   Still worth fixing if you plan to wire them back in."
  );
  for (const { file, phase, err } of orphanErrors) {
    console.log(`\n[${phase}] ${rel(file)}`);
    console.log(`  ${shortErr(err)}`);
  }
}

if (criticalErrors.length) {
  console.log("\n❌ Route graph failed — do not ship.");
  process.exitCode = 1;
} else if (STRICT && orphanErrors.length) {
  console.log("\n❌ Strict mode: orphan failures present.");
  process.exitCode = 1;
} else if (orphanErrors.length) {
  console.log(
    "\n✅ Route graph OK. Orphan failures listed above (use --strict to fail on them)."
  );
  process.exitCode = 0;
} else {
  console.log("\n✅ all clear");
  process.exitCode = 0;
}

setTimeout(() => process.exit(process.exitCode || 0), 250).unref?.();
