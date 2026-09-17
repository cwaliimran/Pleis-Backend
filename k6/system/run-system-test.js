#!/usr/bin/env node
/**
 * Professional system / load harness for Pleis prodtest.
 * Uses Postman-aligned payloads + bootstrap admin/guest from .env.prodtest.
 *
 * Usage:
 *   NODE_ENV=prodtest node k6/system/run-system-test.js
 *   BASE_URL=http://127.0.0.1:4020 CONCURRENCY=20 DURATION_SEC=60 node k6/system/run-system-test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");

require("dotenv").config({
  path: path.join(__dirname, "../../.env.prodtest"),
});

const ROOT = path.join(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "k6/system/reports");
const BASE =
  (process.env.API_ORIGIN || "http://127.0.0.1:4020").replace(/\/$/, "") +
  "/api/v1";
const CONCURRENCY = Number(process.env.CONCURRENCY || 15);
const DURATION_SEC = Number(process.env.DURATION_SEC || 45);
const RUN_ID = `sys-${Date.now()}`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const stats = {
  startedAt: new Date().toISOString(),
  base: BASE,
  runId: RUN_ID,
  phases: [],
  endpoints: {},
  errors: [],
  seeded: {},
  tokens: {},
};

function xff() {
  return `198.51.100.${20 + Math.floor(Math.random() * 200)}`;
}

function record(name, status, ms, ok) {
  if (!stats.endpoints[name]) {
    stats.endpoints[name] = {
      ok: 0,
      fail: 0,
      statuses: {},
      latencies: [],
    };
  }
  const e = stats.endpoints[name];
  e.statuses[status] = (e.statuses[status] || 0) + 1;
  e.latencies.push(ms);
  if (ok) e.ok += 1;
  else e.fail += 1;
}

async function req(name, method, urlPath, { token, body, headers, expect } = {}) {
  const started = Date.now();
  const url = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
  try {
    const res = await axios({
      method,
      url,
      data: body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Timezone": "UTC",
        "X-Forwarded-For": xff(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      validateStatus: () => true,
      timeout: 30000,
    });
    const ms = Date.now() - started;
    const expected = expect || ((s) => s >= 200 && s < 500 && s !== 429);
    const ok = typeof expected === "function" ? expected(res.status) : expect.includes(res.status);
    record(name, res.status, ms, ok);
    if (!ok) {
      stats.errors.push({
        name,
        status: res.status,
        ms,
        message: res.data?.message,
        path: urlPath,
      });
    }
    return { status: res.status, data: res.data, ms, ok };
  } catch (err) {
    const ms = Date.now() - started;
    record(name, 0, ms, false);
    stats.errors.push({ name, status: 0, ms, message: err.message, path: urlPath });
    return { status: 0, data: null, ms, ok: false, error: err.message };
  }
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[i];
}

async function phase(name, fn) {
  const t0 = Date.now();
  console.log(`\n===== PHASE: ${name} =====`);
  const result = await fn();
  const ms = Date.now() - t0;
  stats.phases.push({ name, ms, result });
  console.log(`----- done ${name} in ${ms}ms -----`);
  return result;
}

async function login(role) {
  const isAdmin = role === "admin";
  const body = {
    email: isAdmin
      ? process.env.BOOTSTRAP_ADMIN_EMAIL
      : process.env.BOOTSTRAP_GUEST_EMAIL,
    password: isAdmin
      ? process.env.BOOTSTRAP_ADMIN_PASSWORD
      : process.env.BOOTSTRAP_GUEST_PASSWORD,
    userType: isAdmin ? "admin" : "guest",
    deviceType: "web",
    deviceId: `${RUN_ID}-${role}`,
    timezone: "UTC",
  };
  const headers = isAdmin
    ? { "x-admin-access-token": process.env.ADMIN_ACCESS_TOKEN || "" }
    : {};
  const res = await req(`auth.login.${role}`, "POST", "/auth/login", {
    body,
    headers,
    expect: [200],
  });
  const token = res.data?.data?.token;
  if (!token) throw new Error(`Failed ${role} login: ${res.status} ${res.data?.message}`);
  stats.tokens[role] = token;
  // store profile without JWT in seeded report data
  const safe = { ...(res.data.data || {}) };
  delete safe.token;
  stats.seeded[`${role}User`] = safe;
  return token;
}

async function discover(adminToken, guestToken) {
  const out = {};

  const countries = await req("locations.countries", "GET", "/locations/countries", {
    expect: [200],
  });
  out.countries = countries.data?.data?.length || countries.data?.data?.docs?.length || 0;

  const settings = [
    "/settings/privacy-policy",
    "/settings/terms-conditions",
    "/settings/about-us",
    "/settings/faqs",
  ];
  for (const p of settings) {
    await req(`settings${p}`, "GET", p, { expect: [200] });
  }

  // Admin lists
  const orgs = await req("admin.organizations.list", "GET", "/admin/organizations?page=1&limit=10", {
    token: adminToken,
    expect: (s) => s === 200 || s === 403,
  });
  out.orgs = orgs.data?.data || [];
  if (Array.isArray(out.orgs) && out.orgs[0]) {
    out.orgId = out.orgs[0]._id || out.orgs[0].id;
  } else if (out.orgs?.docs?.[0]) {
    out.orgId = out.orgs.docs[0]._id;
    out.orgs = out.orgs.docs;
  }

  const venues = await req("admin.venues.list", "GET", "/admin/venues?page=1&limit=10", {
    token: adminToken,
    expect: (s) => [200, 403, 404].includes(s),
  });
  out.venues = venues.data?.data?.docs || venues.data?.data || [];

  const users = await req("admin.users.list", "GET", "/admin/users?page=1&limit=10", {
    token: adminToken,
    expect: (s) => [200, 403, 404].includes(s),
  });
  out.users = users.data?.data?.docs || users.data?.data || [];

  const events = await req("admin.events.list", "GET", "/admin/events?page=1&limit=10", {
    token: adminToken,
    expect: (s) => [200, 403, 404].includes(s),
  });
  out.events = events.data?.data?.docs || events.data?.data || [];

  // App browse (guest)
  const nearby = await req(
    "app.orgs.nearby",
    "GET",
    "/app/organizations/nearby?radiusKm=500&latitude=45.815&longitude=15.982&page=1&limit=10",
    { token: guestToken, expect: (s) => [200, 400, 401, 404].includes(s) },
  );
  out.nearby = nearby.data?.data?.docs || nearby.data?.data || [];

  const popular = await req(
    "app.popular.events",
    "POST",
    "/app/popular-events?latitude=45.815&longitude=15.982&radiusKm=50&page=1&limit=10",
    { token: guestToken, body: {}, expect: (s) => [200, 400, 401, 404].includes(s) },
  );
  out.popular = popular.status;

  // Public globals
  await req("tags.global", "GET", "/tags/global?page=1&limit=10", {
    token: guestToken,
    expect: (s) => [200, 401].includes(s),
  });
  await req("categories.via.admin", "GET", "/admin/categories?page=1&limit=5", {
    token: adminToken,
    expect: (s) => [200, 403].includes(s),
  });

  // Menu items if we have org
  if (out.orgId) {
    await req(
      "app.menu.items",
      "GET",
      `/app/menu/items?organization=${out.orgId}&page=1&limit=10`,
      { token: guestToken, expect: (s) => [200, 400, 401, 404].includes(s) },
    );
  }

  stats.seeded.discovered = {
    orgCount: Array.isArray(out.orgs) ? out.orgs.length : 0,
    venueCount: Array.isArray(out.venues) ? out.venues.length : 0,
    userCount: Array.isArray(out.users) ? out.users.length : 0,
    eventCount: Array.isArray(out.events) ? out.events.length : 0,
    orgId: out.orgId || null,
    countries: out.countries,
  };
  return out;
}

async function seedUsers(adminToken) {
  const created = [];
  // Create app users
  for (let i = 0; i < 3; i++) {
    const email = `loaduser.${RUN_ID}.${i}@example.com`;
    const body = {
      firstName: "Load",
      lastName: `User${i}`,
      username: `ld${String(RUN_ID).slice(-8)}${i}`,
      email,
      password: "LoadTest#123",
      userType: "user",
      dob: "1995-03-16",
      gender: "Male",
      phoneNumber: { code: "+385", number: `91${String(1000000 + i)}` },
    };
    const res = await req("admin.users.create.user", "POST", "/admin/users", {
      token: adminToken,
      body,
      expect: (s) => [200, 201, 400, 403, 409, 422].includes(s),
    });
    created.push({
      type: "user",
      email,
      status: res.status,
      message: res.data?.message,
      id:
        res.data?.data?._id ||
        res.data?.data?.basicInfo?._id ||
        res.data?.data?.user?._id ||
        null,
    });
  }

  // Create organizers (needed for orgs)
  for (let i = 0; i < 2; i++) {
    const email = `loadorg.${RUN_ID}.${i}@example.com`;
    const body = {
      firstName: "Load",
      lastName: `Org${i}`,
      organizationName: `Load Co ${RUN_ID}-${i}`,
      email,
      password: "LoadTest#123",
      userType: "organizer",
      phoneNumber: { code: "+385", number: `92${String(1000000 + i)}` },
      companyDetails: {
        name: `Load Co ${RUN_ID}-${i}`,
        oib: `1234567890${i}`,
        bankAccountNumber: "HR1234567890001234567",
        representativeName: "Load Tester",
        location: {
          coordinates: [16.4402, 43.5081],
          fullAddress: "Test Street 1, Split",
          country: "Croatia",
          city: "Split",
          state: "Splitsko-dalmatinska",
          postalCode: "21000",
        },
        suppliers: [],
      },
    };
    const res = await req("admin.users.create.organizer", "POST", "/admin/users", {
      token: adminToken,
      body,
      expect: (s) => [200, 201, 400, 403, 409, 422].includes(s),
    });
    const id =
      res.data?.data?._id ||
      res.data?.data?.basicInfo?._id ||
      res.data?.data?.user?._id ||
      null;
    created.push({
      type: "organizer",
      email,
      status: res.status,
      message: res.data?.message,
      id,
    });
  }
  stats.seeded.users = created;
  stats.seeded._organizerIds = created
    .filter((c) => c.type === "organizer" && c.id)
    .map((c) => String(c.id));
  return created;
}

async function seedOrgLight(adminToken, discovered) {
  let organizerId = (stats.seeded._organizerIds || [])[0];
  if (!organizerId) {
    organizerId =
      discovered.users?.find?.((u) => u.accountState?.userType === "organizer")?._id ||
      discovered.orgs?.[0]?.basicInfo?.user ||
      discovered.orgs?.[0]?.user;
  }
  if (organizerId && typeof organizerId === "object") {
    organizerId = organizerId._id || organizerId.id;
  }
  organizerId = organizerId ? String(organizerId) : null;

  if (!organizerId || !/^[a-f0-9]{24}$/i.test(organizerId)) {
    stats.seeded.organization = {
      skipped: true,
      reason: `no valid organizer ObjectId (got ${organizerId})`,
    };
    return null;
  }

  const orgBody = {
    basicInfo: {
      media: { logo: "org-logo_pic1.png", cover: "org-cover.jpg" },
      name: `Load Org ${RUN_ID}`,
      user: organizerId,
      phoneNumber: { code: "+385", number: "99111222" },
      website: "https://pleis.com",
      socialLinks: {},
    },
  };
  const org = await req("admin.organizations.create", "POST", "/admin/organizations", {
    token: adminToken,
    body: orgBody,
    expect: (s) => [200, 201, 400, 403, 422].includes(s),
  });
  const orgId = org.data?.data?._id || org.data?.data?.basicInfo?._id;
  stats.seeded.organization = {
    status: org.status,
    message: org.data?.message,
    id: orgId || null,
    organizerId,
  };

  if (orgId) {
    const menu = await req("admin.menu.create", "POST", "/admin/menu", {
      token: adminToken,
      body: {
        title: `Load Menu ${RUN_ID}`,
        description: "System load test menu",
        organization: String(orgId),
        startDate: "2026-01-01",
      },
      expect: (s) => [200, 201, 400, 403, 422].includes(s),
    });
    stats.seeded.menu = {
      status: menu.status,
      message: menu.data?.message,
      id: menu.data?.data?._id || null,
    };
  }
  return orgId || null;
}

async function loadPhase(adminToken, guestToken, discovered) {
  const orgId = discovered.orgId || stats.seeded.organization?.id;
  const routes = [
    { name: "L.health", method: "GET", path: "http://127.0.0.1:4020/health", token: null, absolute: true },
    { name: "L.apiRoot", method: "GET", path: "http://127.0.0.1:4020/api", token: null, absolute: true },
    { name: "L.countries", method: "GET", path: "/locations/countries", token: null },
    { name: "L.privacy", method: "GET", path: "/settings/privacy-policy", token: null },
    { name: "L.faqs", method: "GET", path: "/settings/faqs", token: null },
    { name: "L.guest.nearby", method: "GET", path: "/app/organizations/nearby?radiusKm=500&latitude=45.815&longitude=15.982&page=1&limit=5", token: guestToken },
    { name: "L.guest.popular", method: "POST", path: "/app/popular-events?latitude=45.815&longitude=15.982&radiusKm=50&page=1&limit=5", token: guestToken, body: {} },
    { name: "L.guest.foryou.orgs", method: "POST", path: "/app/organizations/for-you?latitude=45.815&longitude=15.982&radiusKm=500&page=1&limit=5", token: guestToken, body: {} },
    { name: "L.guest.trending", method: "POST", path: "/app/organizations/trending?latitude=45.815&longitude=15.982&radiusKm=50&page=1&limit=5", token: guestToken, body: {} },
    { name: "L.admin.orgs", method: "GET", path: "/admin/organizations?page=1&limit=10", token: adminToken },
    { name: "L.admin.venues", method: "GET", path: "/admin/venues?page=1&limit=10", token: adminToken },
    { name: "L.admin.users", method: "GET", path: "/admin/users?page=1&limit=10", token: adminToken },
    { name: "L.admin.events", method: "GET", path: "/admin/events?page=1&limit=10", token: adminToken },
    { name: "L.admin.dashboard", method: "GET", path: "/admin/dashboard?page=1&limit=10", token: adminToken },
  ];
  if (orgId) {
    routes.push({
      name: "L.guest.menu",
      method: "GET",
      path: `/app/menu/items?organization=${orgId}&page=1&limit=10`,
      token: guestToken,
    });
    routes.push({
      name: "L.app.org.profile",
      method: "GET",
      path: `/app/organizations/${orgId}`,
      token: guestToken,
    });
  }

  const endAt = Date.now() + DURATION_SEC * 1000;
  let inFlight = 0;
  let launched = 0;
  const workers = [];

  console.log(`Load: concurrency=${CONCURRENCY} duration=${DURATION_SEC}s routes=${routes.length}`);

  async function worker(id) {
    while (Date.now() < endAt) {
      const r = routes[launched++ % routes.length];
      inFlight++;
      const urlPath = r.absolute ? r.path : r.path;
      await req(r.name, r.method, urlPath, {
        token: r.token,
        body: r.body,
        expect: (s) => s > 0 && s < 500, // count 429 separately but not as crash
      });
      inFlight--;
      // tiny jitter
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
    }
  }

  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker(i));
  await Promise.all(workers);
  return { launched, routes: routes.length };
}

function summarize() {
  const summary = {
    startedAt: stats.startedAt,
    finishedAt: new Date().toISOString(),
    base: BASE,
    runId: RUN_ID,
    concurrency: CONCURRENCY,
    durationSec: DURATION_SEC,
    phases: stats.phases.map((p) => ({ name: p.name, ms: p.ms })),
    seeded: stats.seeded,
    endpointCount: Object.keys(stats.endpoints).length,
    endpoints: {},
    totals: { ok: 0, fail: 0, reqs: 0 },
    errorSample: stats.errors.slice(0, 40),
    errorCount: stats.errors.length,
  };

  for (const [name, e] of Object.entries(stats.endpoints)) {
    const l = e.latencies;
    summary.endpoints[name] = {
      ok: e.ok,
      fail: e.fail,
      reqs: e.ok + e.fail,
      statuses: e.statuses,
      p50: percentile(l, 50),
      p95: percentile(l, 95),
      p99: percentile(l, 99),
      max: l.length ? Math.max(...l) : null,
    };
    summary.totals.ok += e.ok;
    summary.totals.fail += e.fail;
    summary.totals.reqs += e.ok + e.fail;
  }
  return summary;
}

function toMarkdown(summary) {
  const lines = [];
  lines.push(`# Pleis System / Load Test Report`);
  lines.push("");
  lines.push(`- **Run ID:** ${summary.runId}`);
  lines.push(`- **Target:** ${summary.base}`);
  lines.push(`- **Started:** ${summary.startedAt}`);
  lines.push(`- **Finished:** ${summary.finishedAt}`);
  lines.push(`- **Concurrency:** ${summary.concurrency}`);
  lines.push(`- **Load duration:** ${summary.durationSec}s`);
  lines.push(`- **Total requests:** ${summary.totals.reqs}`);
  lines.push(`- **OK:** ${summary.totals.ok}`);
  lines.push(`- **Fail/soft-fail:** ${summary.totals.fail}`);
  lines.push("");
  lines.push(`## Seed / discovery`);
  lines.push("```json");
  lines.push(JSON.stringify(summary.seeded, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`## Endpoint performance`);
  lines.push("");
  lines.push(`| Endpoint | Reqs | OK | Fail | p50 | p95 | p99 | max | Statuses |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`);
  const rows = Object.entries(summary.endpoints).sort((a, b) => b[1].reqs - a[1].reqs);
  for (const [name, e] of rows) {
    lines.push(
      `| ${name} | ${e.reqs} | ${e.ok} | ${e.fail} | ${e.p50} | ${e.p95} | ${e.p99} | ${e.max} | ${JSON.stringify(e.statuses)} |`,
    );
  }
  lines.push("");
  lines.push(`## Error sample (${summary.errorCount} total)`);
  lines.push("```json");
  lines.push(JSON.stringify(summary.errorSample, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`## Verdict notes`);
  const rate429 = Object.values(summary.endpoints).reduce((n, e) => n + (e.statuses[429] || 0), 0);
  const rate5xx = Object.values(summary.endpoints).reduce(
    (n, e) => n + Object.entries(e.statuses).filter(([s]) => Number(s) >= 500).reduce((a, [, c]) => a + c, 0),
    0,
  );
  lines.push(`- HTTP 429 count: **${rate429}**`);
  lines.push(`- HTTP 5xx count: **${rate5xx}**`);
  lines.push(`- Admin/guest login: ${summary.seeded.adminUser ? "admin OK" : "admin FAIL"}, ${summary.seeded.guestUser ? "guest OK" : "guest FAIL"}`);
  if (rate5xx === 0) lines.push(`- No 5xx observed under this load profile.`);
  else lines.push(`- Investigate 5xx endpoints above.`);
  return lines.join("\n");
}

async function main() {
  console.log(`System test → ${BASE} run=${RUN_ID}`);

  await phase("auth", async () => {
    const guest = await login("guest");
    const admin = await login("admin");
    return { guest: !!guest, admin: !!admin };
  });

  const discovered = await phase("discover", () =>
    discover(stats.tokens.admin, stats.tokens.guest),
  );

  await phase("seed-users", () => seedUsers(stats.tokens.admin));
  await phase("seed-org", () => seedOrgLight(stats.tokens.admin, discovered));

  await phase("load", () =>
    loadPhase(stats.tokens.admin, stats.tokens.guest, discovered),
  );

  // Post-load health
  await phase("post-health", async () => {
    await req("post.health", "GET", "http://127.0.0.1:4020/health", {
      expect: [200],
    });
    await req("post.api", "GET", "http://127.0.0.1:4020/api", { expect: [200] });
  });

  const summary = summarize();
  const jsonPath = path.join(OUT_DIR, `${RUN_ID}.json`);
  const mdPath = path.join(OUT_DIR, `${RUN_ID}.md`);
  const latestMd = path.join(OUT_DIR, "LATEST.md");
  const latestJson = path.join(OUT_DIR, "LATEST.json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  const md = toMarkdown(summary);
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(latestMd, md);
  fs.writeFileSync(latestJson, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${mdPath}`);
  console.log(`Totals: reqs=${summary.totals.reqs} ok=${summary.totals.ok} fail=${summary.totals.fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
