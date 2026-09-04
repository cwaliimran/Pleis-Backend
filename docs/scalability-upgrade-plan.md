# Scalability upgrade plan

Working checklist for taking this Node/Express monolith from a single mixed process to city-scale multi-instance. Follow **1 → 2 → 3 → 4 → 5**. Do not start the next step until the current **Done when** is met.

This pass is **not** DoorDash. Target: comfortable beyond the current ~20–50 mixed RPS ceiling of one process that also runs Socket.IO, node-cron, and BullMQ workers.

---

## 1. Goal

Run **N Azure App Service instances** of HTTP + Socket.IO without sharing the request event loop with cron or queue workers, without starving Mongo on a 10-connection pool, and without gzip/FCM/email blocking requests.

**In scope:** process split, Redis lock/queue safety, Mongo pool, offload heavy I/O, then scale instance count.

**Out of scope this pass:** splitting API / realtime / workers into separate services, Mongo read replicas, new Redis-on-APIs or indexing campaigns.

---

## 2. Already true / skip

Do **not** plan these as work. Revisit a specific hotspot only if it still shows up after a later step.

| Item | Status |
|------|--------|
| Redis on most APIs | Already in place (`backend/config/redis/`). Do not add a cache campaign. |
| Document indexes | Already in place. Do not add an indexing campaign. |
| Socket.IO Redis adapter | Already wired: `backend/config/sockets/socketRedisAdapter.js` via `initializeSockets()` in `backend/config/sockets/index.js`. Ready for multi-instance emit/rooms. |
| Subscription reminder cron | **Already done.** Changed from every 3s to every 6 hours: `0 */6 * * *` in `backend/config/cron/index.js` (lock `cron:subscription-reminder`). |

Azure PM2: **fork, 1 web + 1 worker** (`backend/config/ecosystem.config.prod.azure.js` / `ecosystem.config.dev.azure.js`, scripts `pm2:azure:prod` / `pm2:azure:dev`). Web heap 1 GB; worker heap 512 MB. Local `ecosystem.config.js` still uses cluster `instances: "max"` for **web only** plus one forked worker — do not copy cluster mode to Azure.

After Step 1, two processes:

- HTTP + Socket.IO — `backend/server.js` → `createSocketServer()` (`PROCESS_ROLE=web`)
- BullMQ workers, node-cron, mongodump — `backend/worker.js` (`PROCESS_ROLE=worker`)

---

## 3. Steps

### Step 1 — Split the process

**Why.** Cron, BullMQ workers, and `mongodump` share the same Node event loop as HTTP and Socket.IO. Under load they steal the loop and cap RPS. Splitting them is the highest-leverage change and must happen **before** adding App Service instances (otherwise every new instance would also start crons and workers).

**What we will change.**

- Keep HTTP + Socket.IO on the **web** process (`backend/server.js`).
- Add a **worker** entry (new file, e.g. `backend/worker.js`) that:
  - Connects Mongo + Redis (reuse `connectToDB` / Redis helpers).
  - Starts BullMQ workers (`backend/bullmq/workers/`).
  - Calls `startCrons()` — **cron runs on the worker process only**.
  - Takes over `backupMongoDB` (today a `setInterval` on the web process).
  - Does **not** bind the public HTTP/Socket.IO server. A tiny local health endpoint is optional.
- Stop the web process from starting background work:
  - Remove / gate `startCrons()` in `server.js`.
  - Stop loading workers from web. Today `require('./bullmq')` pulls in `backend/bullmq/index.js` → `workers/index.js`, which **constructs** `new Worker(...)` (side effect). Web must only import **queues** (`backend/bullmq/queues.js`) to enqueue jobs (e.g. `scheduleMenuActivation` in `backend/admin/menuManagement/menu/menusRepository.js`).
- Add a second start path without duplicating crons on scaled web instances:
  - `package.json`: e.g. `worker` / `pm2:azure:*` still via PM2, not a second copy of cron inside `server.js`.
  - PM2: second app in Azure ecosystem files (`pleis-backend` = web, `pleis-worker` = worker). Worker: `fork`, `instances: 1` on a given machine.
- Azure layout (**decided for this pass**):
  - **Same App Service, two PM2 apps** in `ecosystem.config.*.azure.js` (`pleis-backend` + `pleis-worker`). Cheap, matches “process split not service split”. Worker does **not** bind `PORT` (Azure would conflict with web).
  - **Step 5 implication:** scaling that App Service starts N web + N workers. BullMQ is fine with N consumers; cron is Redis-locked so extra schedulers skip. If we later want **exactly one** cron scheduler, pin `pleis-worker` to a **single-instance** App Service (same codebase, not a 100x service split).

**Files / areas likely involved.**

| Area | Path |
|------|------|
| Web entry | `backend/server.js` (HTTP + Socket.IO only; no cron/workers/backup) |
| New worker entry | `backend/worker.js` (new) |
| Cron | `backend/config/cron/index.js` + jobs under `backend/config/cron/` |
| BullMQ | `backend/bullmq/index.js`, `workers/index.js`, `workers/activeMenuWorker.js`, `queues.js`, `connection.js` |
| Enqueue from web | `backend/admin/menuManagement/menu/menusRepository.js` |
| PM2 / scripts | `backend/config/ecosystem.config.prod.azure.js`, `ecosystem.config.dev.azure.js`, optionally `ecosystem.config.js`; `package.json` scripts `pm2:azure:prod` / `pm2:azure:dev` |
| DB connect (shared) | `backend/helperUtils/server-setup.js` |
| Backup (move off web) | `backend/helperUtils/dataBaseBackup.js` |

**Do not** duplicate cron schedules on web “just in case”. Redis locks (`acquireLock` in `backend/config/redis/redisCache.js`) are a safety net, not permission to run `startCrons()` on every web instance.

**Done when.**

- [x] Two processes start independently (web without cron/workers; worker without public HTTP). `server.js` no longer calls `startCrons` / `backupMongoDB` / `require('./bullmq')`. `worker.js` does not bind HTTP.
- [x] `pm2 status` shows both apps; killing the worker does not take down HTTP. Verified locally (`npm run pm2:dev:start`): worker stopped, `GET /health` still 200, worker restarted. Azure/staging still to confirm.
- [x] Cron jobs fire **only** from the worker. `startCrons` refuses `PROCESS_ROLE=web`; each run logs `role` + `hostname`. Confirm in worker logs after deploy.
- [x] Existing `active-menu` jobs still enqueue from web (`queues.js` only) and consume on worker (`bullmq/index.js` throws if loaded from web).
- [x] Local `dev` / `dev1` still work (web only). Run worker alongside: `npm run dev:worker` (or `npm run worker`) in a second terminal. `npm run pm2:dev:start` starts both.
- [x] Azure start unchanged at the script level (`pm2:azure:prod` / `pm2:azure:dev`); `pm2-runtime` now launches **both** apps from the ecosystem file. No `startCrons()` on web.

**Risk.** Worker also calls `connectToDB()`, which registers `runDBBootstrap()` on `mongoose.connection` open (`backend/config/startupSetup/db.bootstrap.js`). Bootstrap is versioned in Mongo; `runDBBootstrap` now returns immediately if version is already current. Split must not break `activeMenuQueue.add` from the web process (queues vs workers import boundary). Azure `pm2-runtime` must actually launch **both** apps in the ecosystem file.

---

### Step 2 — Make multi-instance safe

**Why.** After Step 1 we can run more web processes. Cron and BullMQ already use Redis, but Azure Cache for Redis 6.0 is **`volatile-lru`** (noted in `backend/bullmq/queues.js`). That policy **evicts keys that have a TTL** under memory pressure. Cron locks are `SET NX EX` on `lock:…` (`acquireLock` in `redisCache.js`). Evicting a lock → two workers run the same cron. Evicting BullMQ keys → lost/delayed jobs.

Socket.IO adapter is already present; this step is **lock/queue durability + a go/no-go**, not new adapter work.

**What we will change.**

- Confirm (ops, Redis INFO / Azure portal) `maxmemory-policy`. If it stays `volatile-lru` and cannot be set to `noeviction` on this SKU:
  - Provision a **second Redis** (or a dedicated DB index if the SKU isolates eviction) for **locks + BullMQ** only. Keep cache on the volatile instance.
  - Point BullMQ `backend/bullmq/connection.js` and lock usage at the durable Redis. Keep `getRedisClient()` for API cache.
- Prefix / key audit (no rewrite of all cache callers):
  - Locks: `lock:cron:*` (and other `lock:` keys).
  - BullMQ: default BullMQ prefixes (`bull:active-menu:…`).
  - Socket adapter: pub/sub only (no stored keys that matter).
- Confirm cron lock TTLs in `backend/config/cron/index.js` are longer than worst-case job runtime (several jobs use 50s TTL; engagement flush uses 120s). If a job can run longer than TTL, two instances can overlap even without eviction.
- Socket.IO: smoke-test emit across two web processes (adapter already in `socketRedisAdapter.js`). No adapter rewrite unless the smoke test fails.

**Files / areas likely involved.**

| Area | Path |
|------|------|
| Lock helpers | `backend/config/redis/redisCache.js` (`acquireLock` / `releaseLock`) |
| App Redis | `backend/config/redis/redisConfig.js` |
| BullMQ Redis | `backend/bullmq/connection.js`, `backend/bullmq/queues.js` |
| Cron lock keys / TTLs | `backend/config/cron/index.js` |
| Socket adapter | `backend/config/sockets/socketRedisAdapter.js` |
| Azure Redis | Portal / Cache SKU (not in repo) |

**Done when.**

- [ ] Written confirmation: lock + queue keys are **not** subject to `volatile-lru` eviction (policy change **or** dedicated noeviction Redis).
- [ ] Two web processes + one worker: a cron lock is acquired once; a second scheduler skips.
- [ ] A test `active-menu` job survives Redis memory pressure (or we have accepted dedicated Redis).
- [ ] Socket event from instance A reaches a client on instance B.
- [ ] Team agrees it is **safe to run N App Service web instances** (actual scale-out is Step 5).

**Risk.** Changing Redis URL for BullMQ/locks without a dual-write window can drop in-flight `active-menu` jobs. Cron TTL < job duration causes duplicate side effects (emails, reminders) even with “correct” policy.

---

### Step 3 — Raise Mongo pool

**Why.** `mongoose.connect` uses **`maxPoolSize: 10`**. Extra web instances (and the new worker) would otherwise serialize on a tiny pool and look like a Mongo bottleneck.

**What we will change.**

- Raise `maxPoolSize` in the actual client config: `backend/helperUtils/server-setup.js` (today `maxPoolSize: 10`, `minPoolSize: 2`).
- Pick a number per process (starting point: **25–50**), then multiply by (web instances + worker processes) and stay under the Atlas / cluster connection limit.
- Keep `serverSelectionTimeoutMS` / `socketTimeoutMS` unless monitoring says otherwise.
- Web and worker both call `connectToDB()` — each process gets its own pool. Do not share a pool across processes.

**Files / areas likely involved.**

| Area | Path |
|------|------|
| Mongoose connect | `backend/helperUtils/server-setup.js` (~L33–38) |

No new indexes. If a specific query still shows up in Atlas slow-query logs **after** the pool bump, fix that query then — not a blanket index pass.

**Done when.**

- [ ] `maxPoolSize` in `server-setup.js` is above 10 and documented next to the Atlas connection budget.
- [ ] Staging: N web + 1 worker; connection count ≈ `pool × processes`, under cluster max.
- [ ] No increase in `MongoWaitQueueTimeout` / pool-wait errors vs baseline.

**Risk.** Pool too large × many instances exhausts Atlas connections and causes total outage. Confirm cluster `maxIncomingConnections` before shipping.

---

### Step 4 — Get heavy I/O off the request path

**Why.** Remaining CPU/blocking work still sits on the web event loop. Gzip is synchronous on every cache write/read. FCM and Mailgun still run in the web process (FCM via `setImmediate`, which does **not** isolate the loop).

**What we will change.**

1. **Replace `gzipSync` / `gunzipSync` with async zlib** in `backend/config/redis/redisCache.js` (`setJson` / `getJson`). That helper is the API cache path — keep behavior (gzip’d JSON, TTL), only stop blocking the loop. Same file: no new cache product.

2. **Move remaining inline FCM / email onto existing BullMQ** (add queues **inside** `backend/bullmq/`, do not add SQS/another library).
   - FCM: `sendUserNotifications` in `backend/controllers/communicationController.js` currently `setImmediate` → `adminFireBConfig.messaging().sendEachForMulticast`. Change that function to **enqueue** a BullMQ job; keep the same function signature so the many call sites do not each get rewritten. Worker runs FCM + `NotificationExp.insertMany`.
   - Email: `sendEmailViaMailgun` in `backend/helperUtils/emailUtil.js` is **awaited on the request path** in auth, subscriptions, and order finalizers. Enqueue from that helper (or a thin wrapper) so callers stay fire-and-forget / non-blocking. Auth emails (verification, reset) may need “accepted, email follows” semantics — do not wait on Mailgun in the HTTP handler.
   - Register new workers next to `activeMenuWorker.js`; export them from `backend/bullmq/workers/index.js`. Queue producers stay importable from web (`queues.js` only).

**Do not** add a new queue system. **Do not** Redis-cache more APIs.

**Files / areas likely involved.**

| Kind | Path |
|------|------|
| Sync gzip | `backend/config/redis/redisCache.js` (`gzipSync` ~L22, `gunzipSync` ~L38) |
| FCM send + `setImmediate` | `backend/controllers/communicationController.js` |
| FCM admin | `backend/config/firebaseAdmin.js` |
| Notification helpers (already go through `sendUserNotifications`) | `backend/controllers/notificationHelper/*.js` |
| Email helper | `backend/helperUtils/emailUtil.js` |
| Email on request path (representative) | `backend/controllers/authController.js`, `backend/controllers/authUtil.js`, `backend/organizer/subscriptions/subscriptionsService.js`, `backend/controllers/notificationHelper/subscriptionNotificationService.js`, `backend/commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/{menu,reservation,ticketing}OrderFinalizerService.js`, `backend/{admin,app,organizer}/usersManagement/usersService.js` |
| BullMQ | `backend/bullmq/queues.js`, `backend/bullmq/workers/` |

High-traffic **callers** of `sendUserNotifications` (no per-file rewrite if the enqueue is centralized): `orderService.js`, in-app ordering services, reservation repos, event/giveaway/promo repos, cron reminder jobs (those already run on the worker after Step 1; still enqueue FCM so the worker loop stays free).

**Done when.**

- [ ] No `gzipSync` / `gunzipSync` on the request path.
- [ ] `sendUserNotifications` enqueues; web process does not call `sendEachForMulticast`.
- [ ] `sendEmailViaMailgun` is not awaited on HTTP handlers (jobs processed by worker).
- [ ] Staging: place an order / trigger a push / request a password-reset email — HTTP returns without waiting on FCM/Mailgun; worker logs show the job.
- [ ] Failed jobs retry via existing BullMQ `defaultJobOptions` (or equivalent on the new queues).

**Risk.** Dual-send during deploy if web still `setImmediate`s while worker also consumes. Auth emails delayed if the worker is down — monitor the new queues. Gzip async must stay binary-compatible with existing Redis values (`getBuffer` + gunzip).

---

### Step 5 — Scale out

**Why.** Instances only help after the process is split, locks/queues are durable, Mongo can take the extra pools, and the request path is not doing gzip/FCM/email.

**What we will change.**

- Increase Azure App Service **instance count** for the **web** app (HTTP + Socket.IO). Infra/ops; little or no application code.
- Worker: keep **one cron scheduler** (single worker App Service or `instances: 1` on a dedicated plan). Extra BullMQ worker processes are optional and safe.
- Do **not** switch Azure PM2 to `exec_mode: cluster` / `instances: max` (`ecosystem.config.js` local cluster is not the Azure model). Horizontal scale = App Service instances, each fork 1 Node web process.
- Confirm load balancer / ARR affinity off (Socket.IO Redis adapter makes sticky sessions unnecessary). Smoke-test websockets after scale-out.
- Watch: CPU/memory per instance, Mongo connections (`pool × web instances + worker`), Redis CPU, BullMQ lag, cron lock skips.

**Files / areas likely involved.**

| Area | Path |
|------|------|
| Azure App Service scale | Azure portal / ARM / pipeline (not in repo) |
| PM2 remains fork/1 per instance | `backend/config/ecosystem.config.prod.azure.js`, `ecosystem.config.dev.azure.js` |

**Done when.**

- [ ] Web instance count > 1 in the target environment.
- [ ] Health `/health` and Socket.IO work on all instances.
- [ ] Cron still runs once per schedule (worker logs).
- [ ] Sustained mixed RPS above the old ~20–50 single-process ceiling without event-loop stall (PM2 / App Service CPU, p95 latency).
- [ ] Mongo connections remain under cluster max.

**Risk.** Scaling web **and** worker together on one App Service plan multiplies cron processes (locks should hold if Step 2 passed). Scaling before Steps 1–4 just multiplies the current bottleneck.

---

## 4. Out of this pass

Do not start these unless this plan is done and a **measured** hotspot remains:

- Split API / realtime / workers into separate deployable **services** (100x architecture).
- Mongo **read replicas** / change-stream fan-out.
- New “add Redis to APIs” or “add indexes everywhere” campaigns.
- PM2 cluster mode on Azure (port conflicts; comment already in `ecosystem.config.dev.azure.js`).
- Replacing BullMQ or node-cron with another scheduler.

---

## 5. How we'll work

1. One step at a time, in order **1 → 2 → 3 → 4 → 5**.
2. Do not start the next step until that step’s **Done when** checkboxes are all checked (staging evidence, not “code merged”).
3. If a later step surfaces one slow endpoint, fix **that** hotspot. Do not reopen skipped cache/index programs.
4. PRs stay small: Step 1 is the largest (entry + PM2). Steps 3 and 5 should be tiny.

**Start next:** Step 1 remaining — confirm on Azure/staging that `pm2 status` shows `pleis-backend` + `pleis-worker` and that killing the worker leaves HTTP up. Do not start Step 2 until that checkbox is ticked.
