# Pleis Backend — AI / developer project context

> Living reference for how this repo is structured and how features are implemented.  
> **Last synced from codebase:** 2026-07-21. Update this file when architecture or conventions change materially.

---

## 1. What Pleis Backend is

**Pleis** is a Node.js / Express REST API for a hospitality / events platform: organizations, venues, events, in-app menu ordering, reservations, ticketing, giveaways, reviews, and **two loyalty layers**:

| Layer | Scope | Typical paths |
|-------|--------|----------------|
| **Organization loyalty** | Per-organization clubs, challenges, rewards, streaks | `backend/admin/loyalty`, `backend/app/loyalty`, `backend/commonModules/loyalty` |
| **Global loyalty** | Platform-wide wallet, status levels, global challenges/rewards | `backend/admin/globalLoyalty`, `backend/app/globalLoyalty`, `backend/commonModules/globalLoyalty` |

Consumers include **mobile apps**, **admin panel**, **organizer (business) portal**, and **staff** tools.

---

## 2. Tech stack

| Area | Choice |
|------|--------|
| Runtime | Node.js (CI uses 22.x) |
| Framework | Express 4 + `express-async-errors` |
| Database | MongoDB via Mongoose 8 (replica set recommended for transactions) |
| Cache | `node-cache` (user), Redis (`ioredis`) for cron locks / socket adapter |
| Auth | JWT (`Authorization: Bearer`), bcrypt passwords |
| Realtime | Socket.IO (`global.io`), Redis adapter available |
| i18n | `i18n` — locales under `assets/locales` |
| Email | Mailgun |
| Push / admin SDK | Firebase Admin (`secretAssets/serviceAccountKey.json`) |
| Files | Azure Blob + legacy upload routes |
| Payments | **Monri** (primary integration), webhooks under `/api/v1/webhooks` |
| API docs | Swagger (`swagger/swagger_output.json`, `/api-docs`) |
| Process mgr | PM2 configs in `backend/config/ecosystem.config*.js`, Azure `pm2-runtime` |
| Tests | Mocha + Supertest in devDependencies; no standard `test/` tree found in repo |

**Entry point:** `backend/server.js`  
**Env files:** `.env.${NODE_ENV}` (e.g. `.env.dev`) — see `.env.example`.

---

## 3. API surface (route prefixes)

All JSON APIs are versioned under `/api/v1`.

| Mount | Audience | Notes |
|-------|----------|--------|
| `/api/v1/app` | End users (mobile) | `backend/routes/appRoutes.js` |
| `/api/v1/admin` | Platform admins | `backend/admin/routes/index.js` — after mount, **auth + `roleMiddleware(["admin"])`** |
| `/api/v1/organizer` | Business / organizer users | `backend/organizer/routes/index.js` — reuses many **admin** route modules |
| `/api/v1/app/staff` | Venue staff | `backend/routes/staffRoutes.js` — **auth + `staff`** |
| `/api/v1` (root router) | Shared / public | `backend/routes/index.js` — auth, upload, settings, communications, global lookups |
| `/api/v1/webhooks` | Payment providers | `commonModules/paymentsIntegrations/paymentsWebhook` |

Health: `GET /health`, `GET /api`.

**Important:** Admin and organizer routers both `router.use("/", require("../../routes/index"))`, so shared routes (auth, upload, etc.) are available under those prefixes too.

---

## 4. User roles and auth behavior

**`USER_TYPES`** (`backend/models/UserModel.js`): `guest`, `user`, `admin`, `manager`, `staff`, `organizer`.

- **`accountState.userType`** is the source of truth in DB; **`authMiddleware`** exposes `req.user.userType` (copied from `accountState`, then `accountState` removed from `req.user`).
- **`roleMiddleware(allowedRoles)`** checks `req.user.userType`.
- **`manager` special case:** On auth, managers are treated as **organizers** for authorization: `req.user._id` is replaced with the **company organizer** (`organizations[0].creator`), and query params `organizations`, `organization`, `organizationsIds`, `companyOrganizerId` are auto-filled from staff-org membership (`getOrganizationsAsStaff`).
- JWT may include **`originalUserId`** for impersonation tracking.
- Client may send **`X-Timezone`** to override user timezone on the request.
- Restricted / suspended accounts get 403 via `accountState.status`.

Auth routes: `/api/v1/auth/*` (`backend/routes/authRoutes.js`) — register, login, OTP reset, social auth, email link flows, rate-limited per route.

---

## 5. Request / response conventions

### Responses

Use **`sendResponse`** from `backend/helperUtils/responseUtil.js`:

- **`translationKey`** → message via `req.__()` (i18n).
- Optional **`data`**, **`meta`** (pagination), **`values`** for `{placeholder}` substitution.
- Dev/prod may attach **`error`** details on failures.

Other helpers in the same file: **`parsePaginationParams`**, **`validateParams`**, **`generateMeta`**, timezone helpers (`convertTimezoneToUtc`, etc.).

### Typical feature layout

```
feature/
  featureRoutes.js      # express.Router, auth, rate limits, roleMiddleware
  featureController.js  # HTTP: parse req, sendResponse
  featureService.js     # business logic
  featureRepository.js  # Mongoose queries
  formatters/           # shape documents for API
```

Not every feature has all layers; larger domains split admin vs app vs organizer copies.

### Rate limiting

`createRateLimiter` from `backend/helperUtils/rateLimiter.js` — applied per-route in route files.

### Security middleware

`backend/middlewares/security.js` — CORS (`backend/config/origins`), helmet, hpp, compression, rate limit (server-level defaults in `server.js`).

### Text moderation

`textModerationMiddleware` on JSON body (after `express.json()`).

---

## 6. Directory map (high level)

```
Pleis-Backend/
├── backend/
│   ├── server.js              # bootstrap
│   ├── routes/                # shared + app + staff route aggregators
│   ├── controllers/           # auth, communications, db, etc.
│   ├── models/                # UserModel, Notifications, SupportRequest, ...
│   ├── middlewares/           # auth, role, security
│   ├── helperUtils/           # responseUtil, dbUtils, email, rateLimiter, ...
│   ├── config/                # logging, redis, cron, sockets, i18n, pm2
│   ├── services/              # cross-cutting (e.g. moderation, global streaks)
│   ├── admin/                 # admin-only features + Mongoose models for CMS entities
│   ├── app/                   # mobile / end-user APIs
│   ├── organizer/             # organizer portal APIs (often wraps admin modules)
│   ├── staff/                 # staff app APIs
│   ├── commonModules/         # shared domain models & integrations (orders, events, payments, ...)
│   └── shared/                # e.g. locations
├── aliasConfig/               # module alias paths (sync with package.json _moduleAliases)
├── assets/locales/            # i18n strings
├── swagger/                   # autogen output
├── scripts/                   # tooling (e.g. combine-files, schema helpers)
├── postman_collection/
└── .github/workflows/         # Azure deploy (dev branch)
```

**Domain models** usually live in `backend/commonModules/<domain>/` as `*.js` Mongoose models; many are registered as **`@ModelName`** aliases in `aliasConfig/pathAliases.config.js` and `package.json`.

---

## 7. Major product domains (where to look)

| Domain | Models / modules | App routes (examples) |
|--------|------------------|------------------------|
| Users & profiles | `models/UserModel.js` | `/app/users` |
| Organizations & venues | `commonModules/organizations`, `venues` | `/app/organizations`, organizer `/organizations` |
| Events & check-in | `commonModules/events` | `/app/events`, `/checkin` |
| Menu & orders | `menuManagement`, `menuItemsAndOrders` | `/app/menu/items`, `/app/menu/orders` |
| Reservations | `commonModules/reservations` | `/app/reservations` |
| Ticketing & bookings | `ticketing`, `bookings/ticketings` | `/app/ticketing-bookings` |
| Org loyalty | `commonModules/loyalty/*` | `/app/loyalty/*` |
| Global loyalty & wallet | `globalLoyalty`, `wallet`, `transactions` | `/app/global-loyalty/*`, `/app/transactions` |
| Promo & referral | `PromoCode`, `globalReferral`, loyalty referral | `/app/promo-codes`, `/app/global-referral` |
| Giveaways, QR, badges | respective `commonModules` | `/app/giveaways`, `/app/qr-code`, `/app/badges` |
| Payments | `paymentsIntegrations/monri`, cards, webhooks | `/app/payments/monri`, `/app/payments/cards` |
| Subscriptions (organizers) | `commonModules/subscriptions`, user `activeSubscription` | organizer `/subscriptions`, admin `/subscriptions` |
| Support & FAQs | models + admin/app routes | `/app/support`, `/app/faqs` |

**Admin** mirrors most CMS operations under `/api/v1/admin/...` (events, menu, loyalty, global-loyalty, subscriptions, transactions, etc.).

**Organizer** exposes a subset geared at business owners; often **imports admin route files** (events, ticketing, reservations, menu items) plus organizer-specific modules (subscriptions, bundles, general APIs).

---

## 8. Subscriptions (organizer billing)

Relevant files:

- **User fields:** `activeSubscription`, `inActiveSubscription`, `isSubscriptionCancelled` on `UserModel` — nested `subscriptionSchema` with `subscriptionTypes` (`free`, `ordering`, `loyalty`, `reservations`, `analytics`), pricing plan (`monthly` / `yearly`), org count, amounts, **`subscriptionTypePayments`** (per-module payment state).
- **Settings:** `@SubscriptionSettings` → `commonModules/subscriptions/SubscriptionSettings.js`
- **Organizer API:** `backend/organizer/subscriptions/` (controller/service/repository/routes)
- **Admin API:** `backend/admin/subscriptions/`
- **Cron:** `config/cron/subScription/subScription.cron.js` (reminders)

Organizer routes (`/api/v1/organizer/subscriptions`):

- Auth on all routes; most endpoints require **`organizer`** role.
- `PATCH /users/payment-status` — body: `{ paymentReference?, providerTransactionId?, items: [{ subscriptionType, status, amount?, currency?, failureReason? }] }` (one or many modules per transaction; auth only).

Controller encodes **module pricing** (`ordering`, `loyalty`, `reservations`, `analytics`), **multi-org pricing tiers**, and proration-style logic with subscription settings from repo.

---

## 9. Infrastructure behaviors

### Startup sequence (`server.js`)

1. Logging, dotenv, module aliases  
2. Express + security + i18n + access logs + JSON + moderation  
3. Routes + Swagger  
4. HTTP server from **`createSocketServer`** (same port as API)  
5. Async: **Mongo connect** → text moderation init → Redis → **crons** → daily Mongo backup interval  

### Crons (`backend/config/cron/index.js`)

Redis distributed locks for single-runner jobs: recurring events/promotions (midnight), event reminders (minute), challenge expiry notices, engagement buffer flush, promo expiry, subscription reminders, giveaway expiry/winners, etc. Some payment reconciliation crons exist but may be commented out.

### Sockets

`backend/config/sockets/` — handlers e.g. orders; use `global.io`.

### Logging

`backend/config/logging` — `global.logger`, `accessLogger`, `crashLogger`; fatal on unhandled rejection / uncaught exception.

---

## 10. Module aliases

Prefer existing aliases over long relative imports when the codebase already does:

- `@utils` → `helperUtils`
- `@UsersModel`, `@OrganizationModel`, `@EventsModel`, … (see `aliasConfig/pathAliases.config.js`)

Run `npm run update:alias` after changing alias config (`aliasConfig/update-aliases.js` syncs into `package.json`).

---

## 11. External integrations checklist

| Integration | Location / env |
|-------------|----------------|
| MongoDB | `BASE_URL` |
| JWT | `JWT_SECRET` |
| Redis | `REDIS_*` |
| Mailgun | `MAILGUN_*` |
| Azure Blob | `AZURE_STORAGE_*` |
| Monri | env in monri modules + webhooks |
| Firebase | service account + `firebaseAdmin` config |
| OpenAI | dependency present (moderation / features as used) |

Uploads: `/api/v1/upload`, `/api/v1/upload/azure`.

---

## 12. CI / deployment

- **GitHub Actions:** `.github/workflows/dev.yml` — on `dev` branch: `npm ci`, artifact upload, deploy to **Azure Web App** (Pleis-backend-dev).
- **PM2:** `npm run pm2:dev:start`, Azure variants `pm2:azure:dev` / `pm2:azure:prod`.

---

## 13. Conventions for new work

1. Match the **Routes → Controller → Service → Repository** pattern and existing naming in the same folder.
2. Use **`sendResponse`** + **translation keys** (add strings to locales when adding user-facing messages).
3. Apply **`auth`** and **`roleMiddleware`** consistently with sibling routes in the same router.
4. Put reusable Mongoose schemas in **`commonModules`**; register **`@` alias** if the model is widely imported.
5. Respect **manager → organizer** impersonation: business logic keyed on `req.user._id` for organizers may already be the company owner when the caller is a manager.
6. Timezone: use helpers from `responseUtil` and/or `req.user.timezone` / `X-Timezone`.
7. Keep changes **minimal**; organizer and admin often share code — fix bugs in shared modules when appropriate.

---

## 14. Known gaps / repo notes

- README is high-level MERN install doc; this file supersedes it for architecture.
- Swagger may be out of date unless regenerated (`swagger/swagger.autogen.js`).
- Automated tests are not wired as a standard suite in-tree.
- **In-flight changes (git snapshot 2026-07-21):** `UserModel.js`, organizer `subscriptions/*`, `.github/workflows/dev.yml`, `scripts/combine-files.js` — verify behavior against latest diff when working on subscriptions or CI.

---

## 15. Quick command reference

```bash
npm i
npm run dev          # NODE_ENV=dev, PORT=4012, nodemon
npm run prod
npm run update:alias
```

Postman: `postman_collection/`.

---

*When you start a new task, point the agent at this file and name the API surface (app / admin / organizer / staff) and domain folder.*
