# Pleis Professional System Test Report (prodtest / local DB)

**Date:** 2026-09-17  
**Target:** `http://127.0.0.1:4020` (`NODE_ENV=prodtest`, local Mongo `pleis-prod-v2`)  
**Sources:** Postman `Pleis.postman_collectionv2.json`, bootstrap admin/guest from `.env.prodtest`, k6 + Node harnesses under `k6/`

---

## 1. Executive verdict

| Area | Result |
|------|--------|
| Admin login | **PASS** |
| Guest login | **PASS** |
| Seed users / organizers | **PASS** (3 users + 2 organizers) |
| Seed organization + menu | **PASS** |
| Mixed authenticated load (25 VU × 75s) | **PASS — 1620/1620 OK, 0×5xx, 0×429** |
| Per-IP rate-limit isolation | **PASS** (earlier suite; attacker 429, victims unaffected) |
| Health under load | **PASS** (p95 ~1–4ms) |

System stayed healthy through browse + admin list traffic. Slowest paths are settings/cache and geo browse (~1.5–2.1s p95), not crashes.

---

## 2. What was exercised

### Auth
- `POST /api/v1/auth/login` as **guest** and **admin** (admin with `x-admin-access-token`)
- Distinct `X-Forwarded-For` IPs so rate-limit buckets stay per client

### Discovery (Postman-aligned reads)
- Settings: privacy, terms, about, FAQs  
- Locations countries (250)  
- Admin: organizations, venues, users, events, dashboard  
- App: nearby / trending / for-you orgs, popular events, org profile, menu items  

### Writes (seed)
- Admin create **user** (dob/gender/username) → 201  
- Admin create **organizer** (+ companyDetails) → 201  
- Admin create **organization** → 201  
- Admin create **menu** → 201  

### Load profile
- Concurrency **25**, duration **75s**, 16 rotating routes  
- Report: `k6/system/reports/LATEST.md`

---

## 3. Load performance snapshot (heavy run)

| Route class | p50 | p95 | Notes |
|-------------|-----|-----|-------|
| `/health`, `/api` | ~1ms | ~5ms | Excellent |
| Guest nearby / org profile | ~0.8s | ~1.1s | Geo queries |
| Admin lists (orgs/venues/users/events) | ~1.3s | ~1.6s | DB-bound |
| Settings FAQs / privacy | ~1.6s | ~2.0s | Cacheable; still OK |
| Guest popular / for-you | ~1.3s | ~1.6s | Heavier aggregations |

**No 429** during this mixed read load (global limit 400/15m per client; traffic used many XFF IPs).

---

## 4. Postman GET walk (100 endpoints)

| Folder | Hits | Success (2xx/3xx) | Notes |
|--------|------|-------------------|-------|
| App | 48 | 39 | 2× **500** on Monri wallet/web-pay session GETs |
| Organizer | 22 | 18 | Mostly healthy |
| Admin Panel | 20 | 18 | Healthy |
| Staff | 8 | 0 | Expected **403** with admin token |
| Manager | 2 | 0 | 404 on sample paths |

**Action item:** Monri payment GET helpers return 500 without a valid session — harden with 400 instead of 500 before go-live.

Report: `k6/system/reports/POSTMAN_WALK_LATEST.md`


- Login limit **20 / 15 min / IP** confirmed  
- Multi-country simulation via XFF: attacker limited; DE/PK/GB/FR/AE victims still served  
- Report: `k6/LAST_REPORT.txt`  
- IP threat logging + admin block APIs shipped earlier in this branch  

---

## 5. Gaps / follow-ups

1. **Server stability during long suites** — nodemon restarts / process exits mid-run interrupted Postman walk & k6 journey sometimes. Prefer `node backend/server.js` (no nodemon) for soak tests.  
2. **Postman coverage** — full collection has 655 requests; walker hits param-free GETs. Path-param routes (`/:id`) need discovered IDs (partially done via org seed).  
3. **Writes under load** — create/update/delete not hammered (by design to avoid DB pollution). Add a capped write scenario if needed.  
4. **Latency budget** — several app/admin GETs p95 > 1.5s locally; worth indexing/cache review before go-live traffic spikes.  
5. **True multi-region** — use Grafana k6 Cloud against staging for real country egress IPs.

---

## 6. How to re-run

```bash
# stable server
NODE_ENV=prodtest node backend/server.js

# functional + load + seed
npm run load:system
npm run load:system:heavy

# Postman GET walk
MAX_GETS=100 NODE_ENV=prodtest node k6/system/postman-walk.js

# k6 authenticated journey
# (export bootstrap vars from .env.prodtest)
BASE_URL=http://127.0.0.1:4020 PROFILE=load ./tmp/k6 run k6/system/authenticated-journey.js

# rate-limit isolation
npm run load:isolation
```

Artifacts: `k6/system/reports/LATEST.md`, `k6/LAST_REPORT.txt`
