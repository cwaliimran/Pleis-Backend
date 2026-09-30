#!/usr/bin/env node
/**
 * Production readiness check for Redis cache.
 *
 * Verifies:
 *  1) cachePolicy — keyword / filters bypass vs plain pagination
 *  2) redisCache — miss → store → hit; flushAllCaches clears keys; no immortal TTLs
 *  3) Live HTTP — home / search / filters / maps / admin flush; body stable across warm hits
 *
 * Usage:
 *   NODE_ENV=prodtest node backend/scripts/verifyCache.js
 *   NODE_ENV=prodtest node backend/scripts/verifyCache.js --base=http://127.0.0.1:4020
 */
"use strict";

const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const REPO_ROOT = path.join(__dirname, "../..");
const NODE_ENV = process.env.NODE_ENV || "prodtest";

require("dotenv").config({ path: path.join(REPO_ROOT, `.env.${NODE_ENV}`) });

const moduleAlias = require("module-alias");
const aliases = require(path.join(REPO_ROOT, "aliasConfig/pathAliases.config"));
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(REPO_ROOT, target));
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE =
  flag("base", null) ||
  process.env.SMOKE_BASE ||
  `http://127.0.0.1:${process.env.PORT || 4020}`;

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, name, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function request(method, urlPath, { token, body, adminHeader, query } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v == null) continue;
        u.searchParams.set(k, String(v));
      }
    }
    const lib = u.protocol === "https:" ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = {
      "Content-Type": "application/json",
      "X-Timezone": "UTC",
      Accept: "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (adminHeader) headers["x-admin-access-token"] = adminHeader;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const t0 = Date.now();
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({
            status: res.statusCode,
            ms: Date.now() - t0,
            json,
            raw,
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function stableClone(obj) {
  return JSON.parse(JSON.stringify(obj ?? null));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function login({ email, password, userType, adminHeader }) {
  const res = await request("POST", "/api/v1/auth/login", {
    adminHeader,
    body: {
      email,
      password,
      userType,
      deviceType: "web",
      deviceId: `cache-verify-${userType}-${Date.now()}`,
      timezone: "UTC",
    },
  });
  const token = res.json?.data?.token || res.json?.data?.accessToken || null;
  return { status: res.status, token, json: res.json };
}

async function sectionPolicy() {
  console.log("\n══ 1) cachePolicy unit checks ══");
  const {
    isPlainListCacheable,
    isPlainSearchCacheable,
    isPlainFilterKeyCacheable,
    isPlainMapCacheable,
    isAdvanceFiltersEmpty,
  } = require("@cachePolicy");

  assert(isPlainListCacheable({}), "list: empty args cacheable");
  assert(isPlainListCacheable({ status: "active" }), "list: status-only still cacheable via caller");
  assert(!isPlainListCacheable({ keyword: "pizza" }), "list: keyword NOT cacheable");
  assert(!isPlainListCacheable({ date: "2026-01-01" }), "list: date NOT cacheable");
  assert(!isPlainListCacheable({ sortBy: "title" }), "list: sortBy NOT cacheable");
  assert(!isPlainListCacheable({ userId: "abc" }), "list: userId NOT cacheable");

  assert(isPlainSearchCacheable({ keyword: "" }), "search: empty keyword cacheable");
  assert(isPlainSearchCacheable({ keyword: "   " }), "search: whitespace keyword cacheable");
  assert(!isPlainSearchCacheable({ keyword: "burger" }), "search: keyword NOT cacheable");
  assert(
    !isPlainSearchCacheable({
      keyword: "",
      advanceFilters: { categories: ["x"] },
    }),
    "search: advanceFilters NOT cacheable"
  );
  assert(isAdvanceFiltersEmpty({}), "advanceFilters empty");
  assert(!isAdvanceFiltersEmpty({ tags: ["1"] }), "advanceFilters with tags");

  assert(isPlainFilterKeyCacheable({}), "filterKey: plain cacheable");
  assert(
    !isPlainFilterKeyCacheable({ title: "Near You" }),
    "filterKey: title NOT cacheable"
  );
  assert(
    !isPlainFilterKeyCacheable({ tagId: ["abc"] }),
    "filterKey: tagId NOT cacheable"
  );

  assert(isPlainMapCacheable({}), "map: plain cacheable");
  assert(!isPlainMapCacheable({ keyword: "cafe" }), "map: keyword NOT cacheable");
  assert(
    !isPlainMapCacheable({ advanceFilters: { venueTypes: ["1"] } }),
    "map: filters NOT cacheable"
  );
}

async function waitForRedis(ms = 15000) {
  const { getRedisClient, isRedisUp } = require("../config/redis/redisConfig");
  const client = getRedisClient();
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (client.status === "ready" || isRedisUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return client.status === "ready" || isRedisUp();
}

async function sectionRedis() {
  console.log("\n══ 2) redisCache miss / hit / flush ══");
  const up = await waitForRedis();
  const { isRedisUp } = require("../config/redis/redisConfig");
  const { cache, invalidate, flushAllCaches, buildKey } = require("@redisCache");
  const { getRedisClient } = require("../config/redis/redisConfig");

  assert(up && isRedisUp(), "Redis is up", up ? "ready" : "DOWN");
  if (!up) {
    fail("redisCache suite skipped", "Redis not ready");
    return;
  }

  const ns = `cacheVerify:test:${Date.now()}`;
  let fetches = 0;
  const fetchFn = async () => {
    fetches += 1;
    return { n: fetches, at: Date.now() };
  };

  const a = await cache({ namespace: ns, params: { page: 1 }, ttl: 60, fetchFn });
  const b = await cache({ namespace: ns, params: { page: 1 }, ttl: 60, fetchFn });
  assert(fetches === 1, "fetchFn called once on miss→hit", `fetches=${fetches}`);
  assert(deepEqual(a, b), "cached payload identical on second read");

  // Immortal TTL coercion
  fetches = 0;
  const ns2 = `${ns}:ttlnull`;
  await cache({
    namespace: ns2,
    params: {},
    ttl: null,
    fetchFn: async () => {
      fetches += 1;
      return { ok: true };
    },
  });
  // deferStore is false by default — key should exist with EX
  await new Promise((r) => setTimeout(r, 200));
  const redis = getRedisClient();
  const key2 = buildKey(ns2, {});
  const ttl = await redis.ttl(key2);
  assert(ttl > 0 && ttl <= 60, "ttl:null coerced to positive EX", `ttl=${ttl}`);

  await invalidate(ns);
  fetches = 0;
  await cache({
    namespace: ns,
    params: { page: 1 },
    ttl: 60,
    fetchFn: async () => {
      fetches += 1;
      return { afterInvalidate: true };
    },
  });
  assert(fetches === 1, "invalidate forces remiss", `fetches=${fetches}`);

  const flush = await flushAllCaches();
  assert(flush.ok === true, "flushAllCaches ok", `deleted=${flush.deleted}`);
  const afterFlush = await redis.exists(key2);
  assert(afterFlush === 0, "flush removed verify keys", `exists=${afterFlush}`);
}

async function hitTwice(label, fn) {
  const first = await fn();
  const second = await fn();
  return { label, first, second };
}

async function sectionHttp() {
  console.log("\n══ 3) Live HTTP cache surfaces ══");
  console.log(`  base: ${BASE}`);

  const guestEmail = process.env.BOOTSTRAP_GUEST_EMAIL;
  const guestPass = process.env.BOOTSTRAP_GUEST_PASSWORD;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminHeader = process.env.ADMIN_ACCESS_TOKEN || "";

  assert(!!guestEmail && !!guestPass, "guest bootstrap creds present");
  assert(!!adminEmail && !!adminPass, "admin bootstrap creds present");

  const guestLogin = await login({
    email: guestEmail,
    password: guestPass,
    userType: "user",
  });
  assert(guestLogin.status === 200 && !!guestLogin.token, "guest login", `status=${guestLogin.status}`);

  const adminLogin = await login({
    email: adminEmail,
    password: adminPass,
    userType: "admin",
    adminHeader,
  });
  assert(
    adminLogin.status === 200 && !!adminLogin.token,
    "admin login",
    `status=${adminLogin.status}`
  );

  if (!guestLogin.token || !adminLogin.token) {
    fail("HTTP suite aborted", "missing tokens");
    return;
  }

  const guest = guestLogin.token;
  const admin = adminLogin.token;

  // Flush before measuring warm behavior
  const flushRes = await request("DELETE", "/api/v1/admin/cache", {
    token: admin,
    adminHeader,
  });
  assert(
    flushRes.status === 200,
    "admin DELETE /cache flush",
    `status=${flushRes.status} deleted=${flushRes.json?.data?.deleted}`
  );

  const lat = 31.5204;
  const lng = 74.3587;

  // HOME
  const home = await hitTwice("home", () =>
    request("POST", "/api/v1/app/home", {
      token: guest,
      query: { latitude: lat, longitude: lng, radiusKm: 50 },
      body: {},
    })
  );
  assert(home.first.status === 200, "home cold status 200", `status=${home.first.status} ${home.first.ms}ms`);
  assert(home.second.status === 200, "home warm status 200", `status=${home.second.status} ${home.second.ms}ms`);
  assert(
    deepEqual(stableClone(home.first.json?.data), stableClone(home.second.json?.data)),
    "home warm body matches cold",
    `cold=${home.first.ms}ms warm=${home.second.ms}ms`
  );

  // SEARCH plain (no keyword) — should cache
  const searchPlain = await hitTwice("search-plain", () =>
    request("POST", "/api/v1/app/home/global/search", {
      token: guest,
      query: {
        latitude: lat,
        longitude: lng,
        page: 1,
        limit: 10,
        type: "all",
      },
      body: { advanceFilters: {} },
    })
  );
  assert(searchPlain.first.status === 200, "search plain cold 200", `${searchPlain.first.ms}ms`);
  assert(searchPlain.second.status === 200, "search plain warm 200", `${searchPlain.second.ms}ms`);
  assert(
    deepEqual(
      stableClone(searchPlain.first.json?.data),
      stableClone(searchPlain.second.json?.data)
    ),
    "search plain warm body matches"
  );

  // SEARCH keyword — must NOT create divergent cache pollution; bodies still ok
  const searchKw = await hitTwice("search-keyword", () =>
    request("POST", "/api/v1/app/home/global/search", {
      token: guest,
      query: {
        latitude: lat,
        longitude: lng,
        page: 1,
        limit: 10,
        keyword: `verify-${Date.now()}`,
        type: "all",
      },
      body: { advanceFilters: {} },
    })
  );
  assert(searchKw.first.status === 200, "search keyword status 200", `${searchKw.first.ms}ms`);
  assert(
    deepEqual(
      stableClone(searchKw.first.json?.data),
      stableClone(searchKw.second.json?.data)
    ),
    "search keyword results stable (uncached path)"
  );

  // SEARCH with advanceFilters — uncached path, still 200
  const searchAf = await request("POST", "/api/v1/app/home/global/search", {
    token: guest,
    query: { latitude: lat, longitude: lng, page: 1, limit: 10 },
    body: { advanceFilters: { categories: ["507f1f77bcf86cd799439011"] } },
  });
  assert(searchAf.status === 200, "search with advanceFilters 200", `${searchAf.ms}ms`);

  // FILTER KEY plain
  const fk = await hitTwice("filterKey-nearYou", () =>
    request("POST", "/api/v1/app/home/global/search", {
      token: guest,
      query: {
        latitude: lat,
        longitude: lng,
        page: 1,
        limit: 10,
        filterKey: "nearYouOrganizations",
      },
      body: { advanceFilters: {} },
    })
  );
  assert([200, 400].includes(fk.first.status), "filterKey nearYou responds", `status=${fk.first.status}`);
  if (fk.first.status === 200) {
    assert(
      deepEqual(stableClone(fk.first.json?.data), stableClone(fk.second.json?.data)),
      "filterKey warm body matches"
    );
  }

  // GLOBAL FILTERS
  const filters = await hitTwice("global-filters", () =>
    request("POST", "/api/v1/app/home/global/filters", {
      token: guest,
      query: { latitude: lat, longitude: lng, radiusKm: 50 },
      body: {},
    })
  );
  assert(filters.first.status === 200, "global filters cold 200", `${filters.first.ms}ms`);
  assert(
    deepEqual(
      stableClone(filters.first.json?.data),
      stableClone(filters.second.json?.data)
    ),
    "global filters warm body matches"
  );

  // MAPS plain bounds
  const mapsBody = {
    filter: { type: "places" },
    bounds: {
      northEast: { latitude: lat + 0.05, longitude: lng + 0.05 },
      southWest: { latitude: lat - 0.05, longitude: lng - 0.05 },
    },
    advanceFilters: {},
  };
  const maps = await hitTwice("maps-plain", () =>
    request("POST", "/api/v1/app/maps", {
      token: guest,
      body: mapsBody,
    })
  );
  assert([200, 201].includes(maps.first.status), "maps plain cold ok", `status=${maps.first.status} ${maps.first.ms}ms`);
  if (maps.first.status === 200 || maps.first.status === 201) {
    assert(
      deepEqual(stableClone(maps.first.json?.data), stableClone(maps.second.json?.data)),
      "maps warm body matches"
    );
  }

  // MAPS with keyword — uncached
  const mapsKw = await request("POST", "/api/v1/app/maps", {
    token: guest,
    body: { ...mapsBody, keyword: "pizza" },
  });
  assert([200, 201].includes(mapsKw.status), "maps keyword ok", `status=${mapsKw.status}`);

  // Admin catalog plain pagination (categories public via app or admin)
  const cats = await hitTwice("admin-categories", () =>
    request("GET", "/api/v1/admin/categories", {
      token: admin,
      adminHeader,
      query: { page: 1, limit: 10 },
    })
  );
  assert([200, 304].includes(cats.first.status), "admin categories ok", `status=${cats.first.status}`);

  // Flush again and confirm home remisses (body still valid)
  await request("DELETE", "/api/v1/admin/cache", { token: admin, adminHeader });
  const homeAfterFlush = await request("POST", "/api/v1/app/home", {
    token: guest,
    query: { latitude: lat, longitude: lng, radiusKm: 50 },
    body: {},
  });
  assert(homeAfterFlush.status === 200, "home after flush still 200", `${homeAfterFlush.ms}ms`);

  // POST flush alias
  const flushPost = await request("POST", "/api/v1/admin/cache/flush", {
    token: admin,
    adminHeader,
  });
  assert(flushPost.status === 200, "admin POST /cache/flush", `status=${flushPost.status}`);
}

async function main() {
  console.log("Cache production verification");
  console.log(`env=${NODE_ENV} base=${BASE}`);

  try {
    await sectionPolicy();
  } catch (e) {
    fail("cachePolicy section crashed", e.message);
  }

  try {
    await sectionRedis();
  } catch (e) {
    fail("redisCache section crashed", e.message || String(e));
  }

  try {
    await sectionHttp();
  } catch (e) {
    fail("HTTP section crashed", e.message || String(e));
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log("\n══ Summary ══");
  console.log(`  passed: ${passed.length}`);
  console.log(`  failed: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`   - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log("  All cache checks passed.");
  }

  // Allow Redis connections to close
  try {
    const { getRedisClient } = require("../config/redis/redisConfig");
    const c = getRedisClient();
    c.disconnect();
  } catch (_) {}
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}

main();
