# Pleis API — k6 load tests

Scripts to measure capacity, latency, and rate-limit / IP-threat behavior against **local**, **prodtest**, or staging.

## Install k6

```bash
# macOS
brew install k6

# or see https://grafana.com/docs/k6/latest/set-up/install-k6/
k6 version
```

k6 is **not** an npm dependency — it is a separate binary.

## Quick start

Start the API (example):

```bash
npm run prodtest
# note PORT from .env.prodtest (default often 3000)
```

Run tests:

```bash
# smoke (tiny)
npm run load:health -- --env PROFILE=smoke
npm run load:public -- --env PROFILE=smoke
npm run load:mixed -- --env PROFILE=smoke

# capacity
BASE_URL=http://127.0.0.1:3000 PROFILE=load RAMP_VUS=80 npm run load:mixed

# prove rate limiter fires (expects some 429s)
BASE_URL=http://127.0.0.1:3000 npm run load:rate-limit

# login / threat logging (will record failed_login; can auto-block your IP)
BASE_URL=http://127.0.0.1:3000 PROFILE=smoke npm run load:login
```

## Scripts

| File | Purpose |
|------|---------|
| `health.js` | Max RPS baseline (almost no DB) |
| `public-reads.js` | Public GETs (settings, locations) |
| `login.js` | Auth flood → rate limit + `IpThreat` logs |
| `rate-limit.js` | Single-IP hammer until 429 |
| `mixed.js` | Realistic mix of health / reads / login |

## Env vars

| Var | Default | Meaning |
|-----|---------|---------|
| `BASE_URL` | `http://127.0.0.1:3000` | API origin |
| `PROFILE` | `load` | `smoke` \| `load` \| `stress` \| `spike` |
| `RAMP_VUS` | `50` | Peak VUs for `load` profile |
| `HOLD` | `3m` | Hold duration for `load` |
| `THINK` | scenario-specific | Sleep between iterations (seconds) |
| `LOGIN_EMAIL` / `LOGIN_PASSWORD` | — | Real creds if `EXPECT_SUCCESS=true` |
| `EXPECT_SUCCESS` | `false` | Expect HTTP 200 on login |
| `USER_TYPE` | `user` | Login body userType |

## Multi-user / multi-country isolation

Proves one limited IP does **not** block others:

```bash
BASE_URL=http://127.0.0.1:4020 npm run load:isolation
# or
bash k6/probe-xff-isolation.sh
```

Uses distinct `X-Forwarded-For` IPs (US attacker + DE/PK/GB/FR/AE victims).
Requires a **stable** server (prefer `NODE_ENV=prodtest node backend/server.js`, not nodemon mid-edit).

Full latest report: `k6/LAST_REPORT.txt`


## Safety

- Prefer **staging / prodtest**, not production.
- `login.js` and `rate-limit.js` create **failed_login** events and can **auto-block** the runner IP (default: 25 failures / 15 min).
- Whitelist your office IP or raise `IP_AUTO_BLOCK_FAILED_LOGINS` while testing.
- Do not point these at production login without an allowlist.

## Reading results

Focus on:

- `http_req_duration` p95 / p99
- `http_req_failed` (network / 5xx)
- custom `*_429` counters — limiter working
- App metrics: Mongo CPU, Redis, Node RPS, Azure App Service instances

After a login flood, check admin:

```http
GET /api/v1/admin/ip-threats?keyword=<your-ip>
```
