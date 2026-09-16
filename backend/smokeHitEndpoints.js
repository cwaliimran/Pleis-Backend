#!/usr/bin/env node
/**
 * Hit every Express-registered endpoint on a running server.
 * Goal: detect process crashes / hung connections — not business correctness.
 * 401/400/403/404/422/500 that still return HTTP = server survived.
 *
 * Prerequisites: server already running (e.g. npm run prodtest)
 *
 * Usage:
 *   NODE_ENV=prodtest node backend/smokeHitEndpoints.js
 *   npm run smoke:hit
 *
 * Flags:
 *   --base=http://127.0.0.1:4020
 *   --concurrency=25
 *   --timeout=8000
 *   --safe              only GET/HEAD (no mutating methods)
 *   --token=JWT         optional Bearer token
 *   --verbose
 */

"use strict";

const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const ROOT = __dirname;
const REPO_ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const BASE = flag(
  "base",
  process.env.SMOKE_BASE ||
    `http://127.0.0.1:${process.env.PORT || 4012}`
);
const CONCURRENCY = Number(flag("concurrency", "25"));
const TIMEOUT_MS = Number(flag("timeout", "8000"));
const SAFE = has("safe");
const VERBOSE = has("verbose");
const TOKEN = flag("token", process.env.SMOKE_TOKEN || "");

require("dotenv").config({
  path: path.join(REPO_ROOT, `.env.${process.env.NODE_ENV || "dev"}`),
});

const moduleAlias = require("module-alias");
const aliases = require(path.join(REPO_ROOT, "aliasConfig/pathAliases.config"));
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(REPO_ROOT, target));
}
require("module-alias/register");

const FAKE_OID = "507f1f77bcf86cd799439011";

function joinPath(a, b) {
  const left = String(a ?? "").replace(/\/+$/, "");
  const pieces = Array.isArray(b) ? b : [b];
  let out = left;
  for (const piece of pieces) {
    if (piece == null || piece === "") continue;
    const right = String(piece).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!right) {
      if (!out) out = "";
      continue;
    }
    out = out ? `${out}/${right}` : right;
  }
  if (!out) return "/";
  return out.startsWith("/") ? out : `/${out}`;
}

/** Express mount regexp → path prefix (e.g. /^\/settings\/?(?=\/|$)/i → /settings) */
function layerMountPath(layer) {
  if (typeof layer.path === "string" && layer.path) return layer.path;
  const re = layer.regexp;
  if (!re || re.fast_slash) return "";
  if (re.fast_star) return "/*";

  const src = re.source || "";
  // Root mount: ^\/?(?=\/|$)
  if (/^\^\\\/\?\(\?=\\\/\|\$\)$/.test(src) || src === "^\\/?$") return "";

  // Strip trailing optional slash + lookahead
  const stripped = src
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\).*$/, "")
    .replace(/\\\/\?$/, "")
    .replace(/\$$/, "");

  // Collect static segments: \/settings \/tags-types
  const segs = [];
  const reSeg = /\\\/([A-Za-z0-9_\-.:]+)|\\\/\(\?:\(\[\^\\\/\]\+\?\)\)|\\\/\(\[\^\\\/\]\+\?\)/g;
  let m;
  while ((m = reSeg.exec(stripped)) !== null) {
    if (m[1]) segs.push(m[1]);
    else segs.push(":param");
  }
  if (!segs.length) return "";
  return "/" + segs.join("/");
}

function collectRoutes(router, prefix = "", acc = []) {
  const stack = router && router.stack;
  if (!stack) return acc;

  for (const layer of stack) {
    if (layer.route) {
      const routePaths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      const methods = Object.keys(layer.route.methods || {})
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase())
        .filter((m) => m !== "HEAD");
      for (const rp of routePaths) {
        if (rp == null) continue;
        const routePath = joinPath(prefix, rp);
        for (const method of methods) {
          if (SAFE && method !== "GET" && method !== "OPTIONS") continue;
          acc.push({ method, path: routePath });
        }
      }
      continue;
    }

    if (layer.name === "router" && layer.handle && layer.handle.stack) {
      const mount = layerMountPath(layer);
      collectRoutes(layer.handle, joinPath(prefix, mount), acc);
    }
  }
  return acc;
}

function materializePath(p) {
  if (p == null || p === "" || p === "undefined") return "/";
  return String(p)
    .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      if (/id|Id|ID/.test(name)) return FAKE_OID;
      return "test";
    })
    .replace(/\*/g, "x")
    .replace(/\/+/g, "/");
}

function requestOnce({ method, path: urlPath }, idx = 0) {
  return new Promise((resolve) => {
    if (!urlPath || urlPath === "undefined") {
      resolve({
        method,
        path: urlPath,
        ok: false,
        kind: "bad_url",
        error: "empty path",
      });
      return;
    }
    let u;
    try {
      u = new URL(urlPath, BASE);
    } catch (err) {
      resolve({
        method,
        path: urlPath,
        ok: false,
        kind: "bad_url",
        error: err.message,
      });
      return;
    }

    const lib = u.protocol === "https:" ? https : http;
    // Unique client IP per request so global/prodtest rate limits don't mask handlers
    const a = 10;
    const b = Math.floor(idx / 65025) % 255;
    const c = Math.floor(idx / 255) % 255;
    const d = (idx % 254) + 1;
    const fakeIp = `${a}.${b}.${c}.${d}`;

    const headers = {
      Accept: "application/json",
      "User-Agent": "pleis-smokeHitEndpoints/1.0",
      Connection: "close",
      "X-Forwarded-For": fakeIp,
      "X-Real-IP": fakeIp,
    };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = "2";
    }

    const started = Date.now();
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // drain
        res.on("end", () => {
          resolve({
            method,
            path: urlPath,
            ok: true,
            kind: "http",
            status: res.statusCode,
            ms: Date.now() - started,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({
        method,
        path: urlPath,
        ok: false,
        kind: "timeout",
        error: `timeout after ${TIMEOUT_MS}ms`,
        ms: Date.now() - started,
      });
    });

    req.on("error", (err) => {
      resolve({
        method,
        path: urlPath,
        ok: false,
        kind: "connection",
        error: err.message,
        code: err.code,
        ms: Date.now() - started,
      });
    });

    if (["POST", "PUT", "PATCH"].includes(method)) req.write("{}");
    req.end();
  });
}

async function poolMap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return out;
}

async function pingHealth(label) {
  const r = await requestOnce({ method: "GET", path: "/health" });
  console.log(
    `  ${label}: ${r.ok ? `HTTP ${r.status}` : `${r.kind} ${r.error || r.code || ""}`}`
  );
  return r;
}

const ENTRYPOINTS = [
  { name: "appRoutes", mount: "/api/v1/app", file: "./routes/appRoutes.js" },
  { name: "adminRoutes", mount: "/api/v1/admin", file: "./admin/routes/index.js" },
  {
    name: "organizerRoutes",
    mount: "/api/v1/organizer",
    file: "./organizer/routes/index.js",
  },
  {
    name: "staffRoutes",
    mount: "/api/v1/app/staff",
    file: "./routes/staffRoutes.js",
  },
  {
    name: "webhooksRoutes",
    mount: "/api/v1/webhooks",
    file: "./commonModules/paymentsIntegrations/paymentsWebhook/routes/webhookRoutes.js",
  },
  { name: "routes", mount: "/api/v1", file: "./routes/index.js" },
];

(async () => {
  const t0 = Date.now();
  console.log("🎯 smokeHitEndpoints");
  console.log(`   base=${BASE}`);
  console.log(`   concurrency=${CONCURRENCY} timeout=${TIMEOUT_MS}ms`);
  console.log(`   mode=${SAFE ? "safe (GET/OPTIONS only)" : "all methods"}`);
  console.log("");

  console.log("── Preflight ──");
  const before = await pingHealth("health before");
  if (!before.ok) {
    console.log("\n❌ Server not reachable. Start it first (npm run prodtest).");
    process.exit(1);
  }

  console.log("");
  console.log("── Discover routes ──");
  const discovered = [
    { method: "GET", path: "/health" },
    { method: "GET", path: "/api" },
  ];

  for (const entry of ENTRYPOINTS) {
    try {
      const mod = require(path.join(ROOT, entry.file));
      const routes = collectRoutes(mod, entry.mount);
      discovered.push(...routes);
      console.log(`  ✅ ${entry.name}: ${routes.length} ops`);
    } catch (err) {
      console.log(`  ❌ ${entry.name}: ${err.message.split("\n")[0]}`);
      process.exit(1);
    }
  }

  // unique method+path
  const uniq = new Map();
  for (const r of discovered) {
    const p = materializePath(r.path);
    uniq.set(`${r.method} ${p}`, { method: r.method, path: p });
  }
  const targets = [...uniq.values()].sort((a, b) =>
    a.path === b.path
      ? a.method.localeCompare(b.method)
      : a.path.localeCompare(b.path)
  );

  console.log(`  unique endpoints to hit: ${targets.length}`);
  console.log("");
  console.log("── Hitting ──");

  let done = 0;
  const results = await poolMap(targets, CONCURRENCY, async (t, idx) => {
    const r = await requestOnce(t, idx);
    done++;
    if (VERBOSE || !r.ok) {
      const tag = r.ok ? `HTTP ${r.status}` : `${r.kind}:${r.error || r.code}`;
      console.log(`  [${done}/${targets.length}] ${t.method.padEnd(6)} ${t.path} → ${tag}`);
    } else if (done % 50 === 0 || done === targets.length) {
      process.stdout.write(`  … ${done}/${targets.length}\r`);
    }
    return r;
  });
  if (!VERBOSE) process.stdout.write("\n");

  const byKind = {};
  const byStatus = {};
  const crashes = [];
  for (const r of results) {
    byKind[r.kind || "unknown"] = (byKind[r.kind || "unknown"] || 0) + 1;
    if (r.ok) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    } else if (r.kind === "connection" || r.kind === "timeout") {
      crashes.push(r);
    }
  }

  console.log("");
  console.log("── Postflight ──");
  const after = await pingHealth("health after");

  const ms = Date.now() - t0;
  console.log("");
  console.log("── Summary ──");
  console.log(`  duration: ${ms}ms`);
  console.log(`  hit: ${results.length}`);
  console.log(`  kinds: ${JSON.stringify(byKind)}`);
  console.log(`  status counts: ${JSON.stringify(byStatus)}`);
  console.log(`  crash-like (connection/timeout): ${crashes.length}`);
  console.log(
    `  server alive after: ${after.ok ? "yes ✅" : "NO ❌ — likely crashed"}`
  );

  if (crashes.length) {
    console.log("");
    console.log("── Crash-like failures (sample) ──");
    for (const r of crashes.slice(0, 40)) {
      console.log(`  ${r.method.padEnd(6)} ${r.path} → ${r.kind} ${r.error || r.code || ""}`);
    }
    if (crashes.length > 40) console.log(`  … +${crashes.length - 40} more`);
  }

  // Exit non-zero only if server died or we saw connection-level failures
  if (!after.ok || crashes.length) {
    process.exitCode = 1;
  } else {
    console.log("\n✅ Server stayed up; all requests got an HTTP response.");
    process.exitCode = 0;
  }

  // don't hang
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref?.();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
