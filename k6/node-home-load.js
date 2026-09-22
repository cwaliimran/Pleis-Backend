#!/usr/bin/env node
/**
 * Node stand-in for k6 when Azure blocks the k6/Go TLS fingerprint ("Forbidden").
 *
 *   BASE_URL=https://…azurewebsites.net AUTH_TOKEN=… VUS=100 HOLD_SEC=120 \
 *     node k6/node-home-load.js
 */
const BASE =
  process.env.BASE_URL ||
  "https://pleis-backend-dev-bgd6a6hxefgwbzg5.germanywestcentral-01.azurewebsites.net";
const TOKEN = process.env.AUTH_TOKEN || "";
const VUS = Number(process.env.VUS || 100);
const HOLD_SEC = Number(process.env.HOLD_SEC || 120);
const RAMP_SEC = Number(process.env.RAMP_SEC || 30);
const THINK_MS = Number(process.env.THINK_MS || 350);
const LAT = process.env.LAT || "0";
const LNG = process.env.LNG || "0";

if (!TOKEN) {
  console.error("AUTH_TOKEN required");
  process.exit(1);
}

const MAP_BODY = JSON.stringify({
  filter: { type: "places" },
  bounds: {
    northEast: { latitude: 32.0, longitude: 75.0 },
    southWest: { latitude: 31.0, longitude: 74.0 },
  },
  advanceFilters: {},
});

const stats = {
  total: 0,
  ok: 0,
  fail: 0,
  s5xx: 0,
  s429: 0,
  byName: {},
};

function record(name, status, ms) {
  stats.total++;
  if (!stats.byName[name]) {
    stats.byName[name] = { n: 0, ok: 0, fail: 0, ms: [] };
  }
  const b = stats.byName[name];
  b.n++;
  b.ms.push(ms);
  if (status >= 200 && status < 300) {
    stats.ok++;
    b.ok++;
  } else {
    stats.fail++;
    b.fail++;
  }
  if (status >= 500) stats.s5xx++;
  if (status === 429) stats.s429++;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[i];
}

async function hit(name, path, body) {
  const t0 = Date.now();
  let status = 0;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: body ?? "{}",
    });
    status = res.status;
    await res.arrayBuffer();
  } catch {
    status = 0;
  }
  record(name, status, Date.now() - t0);
}

async function oneIteration() {
  const roll = Math.random();
  if (roll < 0.35) {
    await hit("home", `/api/v1/app/home?latitude=${LAT}&longitude=${LNG}`);
  } else if (roll < 0.5) {
    await hit(
      "filters",
      `/api/v1/app/home/global/filters?latitude=${LAT}&longitude=${LNG}&radiusKm=50`
    );
  } else if (roll < 0.65) {
    await hit(
      "search",
      `/api/v1/app/home/global/search?latitude=${LAT}&longitude=${LNG}&page=1&limit=10&keyword=a&type=all`,
      JSON.stringify({ sort: "desc", advanceFilters: {} })
    );
  } else if (roll < 0.8) {
    await hit(
      "searchFk",
      `/api/v1/app/home/global/search?latitude=${LAT}&longitude=${LNG}&page=1&limit=10&filterKey=nearYouOrganizations`
    );
  } else {
    await hit("maps", `/api/v1/app/maps`, MAP_BODY);
  }
  await new Promise((r) => setTimeout(r, THINK_MS));
}

async function vuLoop(stopAt) {
  while (Date.now() < stopAt) {
    await oneIteration();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // Warm
  console.log("warmup…");
  await hit("home", `/api/v1/app/home?latitude=${LAT}&longitude=${LNG}`);
  console.log("warmup done; starting ramp", { VUS, RAMP_SEC, HOLD_SEC, BASE });

  const workers = [];
  const holdStop = Date.now() + (RAMP_SEC + HOLD_SEC) * 1000;

  for (let i = 0; i < VUS; i++) {
    const delay = Math.floor((RAMP_SEC * 1000 * i) / VUS);
    workers.push(
      (async () => {
        await sleep(delay);
        await vuLoop(holdStop);
      })()
    );
  }

  const tick = setInterval(() => {
    const elapsed = ((Date.now() - (holdStop - (RAMP_SEC + HOLD_SEC) * 1000)) / 1000).toFixed(0);
    process.stdout.write(
      `\r t=${elapsed}s reqs=${stats.total} ok=${stats.ok} fail=${stats.fail} 5xx=${stats.s5xx} 429=${stats.s429}   `
    );
  }, 2000);

  await Promise.all(workers);
  clearInterval(tick);
  console.log("\n");

  const summary = {
    vus: VUS,
    holdSec: HOLD_SEC,
    total: stats.total,
    ok: stats.ok,
    fail: stats.fail,
    failRate: stats.total ? +(stats.fail / stats.total).toFixed(4) : 0,
    s5xx: stats.s5xx,
    s429: stats.s429,
    rps: +(stats.total / (RAMP_SEC + HOLD_SEC)).toFixed(1),
    endpoints: {},
  };
  for (const [name, b] of Object.entries(stats.byName)) {
    summary.endpoints[name] = {
      n: b.n,
      ok: b.ok,
      fail: b.fail,
      avg: Math.round(b.ms.reduce((a, c) => a + c, 0) / b.ms.length),
      p95: pct(b.ms, 95),
      max: Math.max(...b.ms),
    };
  }
  console.log(JSON.stringify(summary, null, 2));

  const outDir = `k6/results/azure-dev-node-${VUS}vu-${new Date()
    .toISOString()
    .replace(/[:.]/g, "")
    .slice(0, 15)}`;
  require("fs").mkdirSync(outDir, { recursive: true });
  require("fs").writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log("saved", outDir);
  process.exit(summary.failRate > 0.08 || summary.s5xx > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
