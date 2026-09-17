#!/usr/bin/env node
/**
 * Walk Postman collection GET/safe POST reads against local API.
 * Reports coverage + latency/status distribution per folder.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "../../.env.prodtest") });

const COLLECTION = path.join(
  __dirname,
  "../../postman_collection/Pleis.postman_collectionv2.json",
);
const BASE =
  (process.env.API_ORIGIN || "http://127.0.0.1:4020").replace(/\/$/, "") +
  "/api/v1";
const OUT = path.join(__dirname, "reports", `postman-walk-${Date.now()}.json`);
const OUT_MD = path.join(__dirname, "reports", "POSTMAN_WALK_LATEST.md");

function walk(items, folder = "") {
  const out = [];
  for (const it of items || []) {
    const name = it.name || "";
    const f = folder ? `${folder}/${name}` : name;
    if (it.request) {
      const req = it.request;
      const method = (req.method || "GET").toUpperCase();
      let raw = req.url;
      if (typeof raw === "object" && raw) raw = raw.raw || (raw.path || []).join("/");
      out.push({ folder: folder || name, name: f, method, raw: String(raw || "") });
    }
    out.push(...walk(it.item, f));
  }
  return out;
}

function toPath(raw) {
  // {{url}}admin/organizations/ -> /admin/organizations
  let s = raw.replace(/\{\{url\}\}/gi, "").replace(/https?:\/\/[^/]+\/api\/v1\/?/i, "");
  s = s.split("?")[0];
  // skip path params
  if (s.includes(":")) return null;
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+$/, "") || "/";
  return s;
}

async function login() {
  const res = await axios.post(
    `${BASE}/auth/login`,
    {
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      userType: "admin",
      deviceType: "web",
      deviceId: "postman-walk",
      timezone: "UTC",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-admin-access-token": process.env.ADMIN_ACCESS_TOKEN || "",
        "X-Forwarded-For": "203.0.113.250",
      },
      validateStatus: () => true,
    },
  );
  if (res.status !== 200) throw new Error(`admin login ${res.status}`);
  return res.data.data.token;
}

async function main() {
  const col = JSON.parse(fs.readFileSync(COLLECTION, "utf8"));
  const all = walk(col.item);
  const gets = all.filter((r) => r.method === "GET");
  const token = await login();

  const results = [];
  let hit = 0;
  for (const r of gets) {
    const p = toPath(r.raw);
    if (!p) {
      results.push({ ...r, skipped: true, reason: "path-params" });
      continue;
    }
    // Prefer admin namespace when path already has admin/, else try as-is
    const candidates = [];
    if (p.startsWith("/admin/") || p.startsWith("/app/") || p.startsWith("/organizer/")) {
      candidates.push(p);
    } else if (r.folder.startsWith("Admin Panel")) {
      candidates.push(p.startsWith("/admin") ? p : `/admin${p}`);
      candidates.push(p);
    } else if (r.folder.startsWith("App")) {
      candidates.push(p.startsWith("/app") ? p : `/app${p}`);
      candidates.push(p);
    } else {
      candidates.push(p);
    }

    let done = false;
    for (const c of candidates) {
      const t0 = Date.now();
      try {
        const res = await axios.get(`${BASE}${c}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Timezone": "UTC",
            "X-Forwarded-For": `198.51.100.${(hit % 200) + 10}`,
          },
          validateStatus: () => true,
          timeout: 20000,
        });
        const ms = Date.now() - t0;
        results.push({
          folder: r.folder.split("/")[0],
          name: r.name,
          path: c,
          status: res.status,
          ms,
        });
        hit++;
        done = true;
        break;
      } catch (e) {
        results.push({
          folder: r.folder.split("/")[0],
          name: r.name,
          path: c,
          status: 0,
          ms: Date.now() - t0,
          error: e.message,
        });
        done = true;
        break;
      }
    }
    if (!done) results.push({ ...r, skipped: true });
    if (hit >= Number(process.env.MAX_GETS || 120)) break;
  }

  const byFolder = {};
  for (const r of results) {
    if (r.skipped) continue;
    const f = r.folder || "root";
    if (!byFolder[f]) byFolder[f] = { n: 0, ok: 0, statuses: {}, lat: [] };
    byFolder[f].n++;
    byFolder[f].statuses[r.status] = (byFolder[f].statuses[r.status] || 0) + 1;
    byFolder[f].lat.push(r.ms);
    if (r.status >= 200 && r.status < 400) byFolder[f].ok++;
  }

  const summary = {
    base: BASE,
    totalGetsInCollection: gets.length,
    exercised: results.filter((r) => !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    byFolder,
    sample5xx: results.filter((r) => r.status >= 500).slice(0, 20),
    sample404: results.filter((r) => r.status === 404).slice(0, 15),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));

  const md = [
    `# Postman GET walk report`,
    ``,
    `- Base: ${BASE}`,
    `- Collection GETs: ${gets.length}`,
    `- Exercised: ${summary.exercised}`,
    `- Skipped (path params): ${summary.skipped}`,
    ``,
    `## By folder`,
    `| Folder | Hits | 2xx/3xx | Statuses |`,
    `|---|---:|---:|---|`,
    ...Object.entries(byFolder).map(
      ([f, v]) => `| ${f} | ${v.n} | ${v.ok} | ${JSON.stringify(v.statuses)} |`,
    ),
    ``,
    `## 5xx sample`,
    "```json",
    JSON.stringify(summary.sample5xx, null, 2),
    "```",
  ].join("\n");
  fs.writeFileSync(OUT_MD, md);
  console.log(md);
  console.log("Wrote", OUT_MD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
