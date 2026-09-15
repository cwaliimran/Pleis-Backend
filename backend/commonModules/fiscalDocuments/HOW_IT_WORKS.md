# Fiscal documents — how it is connected and how it works

This module issues two kinds of post-payment documents:

1. **Fiscal invoices** (Croatian fiscalization via Billko) for ticketing and organizer subscriptions.
2. **Payment confirmations** (internal PDF documents, not fiscalized) for ticketing, in-app ordering, and reservations.

Ticketing gets both: Billko fiscal invoices plus a Pleis payment confirmation that lists event, ticket types, and individual ticket IDs. Menu orders and reservations only get payment confirmations (Billko §5).

It does **not** fiscalize menu orders or reservations. Those historically had Billko invoice helpers (`issueOrderingInvoices`, `issueReservationInvoices` in `jobs/documentService.js`); they are kept as unused helpers. Live jobs for those products only issue payment confirmations.

---

## Folder map

```
fiscalDocuments/
├── api/              HTTP routes, auth, document download, app deep-link
├── confirmation/     Payment confirmation numbering, HTML, email, storage
├── invoice/          Fiscal invoice HTML → PDF, Azure cache, email attachments
├── jobs/             Orchestrator: payment succeeded → invoice and/or confirmation
├── locales/          Croatian / English copy
├── models/           MongoDB collections
├── shared/           HTML token helpers used by both document types
├── templates/        HTML templates
└── scripts/          Offline verification (no Mongo / Monri / Billko)
```

### `api/`

HTTP surface for already-issued documents.

| File | Role |
| --- | --- |
| `routes.js` | Mounts `/open`, then auth, then confirmation + invoice GET. |
| `controller.js` | Loads a confirmation or invoice, checks access, returns JSON, HTML redirect, or PDF. |
| `access.js` | Admin can see everything. Organizers can see their own confirmations and non-`service_fee` invoices. Service-fee invoices are Pleis-only. |
| `openAppRedirect.js` | Builds `GET /app/open?id=PC-…`. The page tries the native app scheme (`com.pleis://wallet/…`) then falls back to store / web. Confirmation emails and HTML documents use this URL as “Open in the app”. |
| `mailgunWebhook.js` | `POST /api/v1/webhooks/mailgun/delivery` — maps delivered/bounced to `PaymentConfirmation.deliveryStatus`. |

Mounted at:

- App: `/api/v1/app/fiscal-documents` (and `/api/v1/app/open` for the deep-link page)
- Organizer: `/api/v1/organizer/fiscal-documents`
- Admin: `/api/v1/admin/fiscal-documents`

Authenticated endpoints:

- `GET /confirmations/:confirmationNumber` — redirect to stored PDF, or `?format=json` (detail + `openUrl` + `deliveryStatus` + `pdfAvailable`) / `?format=download`
- `GET /invoices/:id` — generated PDF download, or `?format=json`

### `jobs/`

`documentService.js` is the only orchestrator. The BullMQ worker (`backend/bullmq/workers/fiscalDocumentsWorker.js`) calls `handleSuccessfulPayment(job.data)` with `{ kind, orderId }`.

| `kind` | Handler | Output |
| --- | --- | --- |
| `ticketing_invoices` | `issueTicketingInvoices` | Two Billko invoices (Pleis service fee + organizer tickets), PDFs emailed, plus payment confirmation PDF/email with event and ticket details |
| `ordering_confirmation` | `issueOrderingConfirmation` | Payment confirmation PDF + covering email with PDF attached |
| `reservation_confirmation` | `issueReservationConfirmation` | Payment confirmation PDF + covering email with PDF attached; min-spend reservations also get a `PLS-…` voucher |
| `subscription_invoice` | `issueSubscriptionInvoice` | One Pleis Billko e-invoice for the organizer |
| `ticketing_storno` | `stornoTicketingInvoices` | Plans ticket storno; live Billko only if `BILLKO_STORNO_ENABLED=true`. Full → `/invoices/refund`; partial → create type-1 + referent pair (`refund_storno`). Fee kept by default. |

`applyBillkoCallback` is not a queue job. Billko’s webhook (`paymentsIntegrations/billko/billkoCallbackController.js`) calls it to update fiscalization numbers and then cache/email PDFs.

`ensureInvoice` is the idempotent Billko create path: reuse local row if it already has a `billkoId`, else look up remote invoices by order number + product unique-code prefix, else `createInvoice`.

### `confirmation/`

Internal payment receipts for ordering and reservations.

| File | Role |
| --- | --- |
| `generator.js` | Allocates `PC-YYYY-########`, writes `PaymentConfirmation`, renders HTML → PDF (Puppeteer), SHA-256 hashes the PDF, uploads PDF to Azure, emails Mailgun covering HTML with PDF attached. Also issues cancellation confirmations that mark the original `CANCELLED`. |
| `htmlRenderer.js` | Fills `templates/confirmation.html` and `templates/confirmation-email.html`. Strips voucher / cancellation blocks when unused. |
| `helpers.js` | Card last4/brand from Monri payload, SHA-256 of HTML/PDF, menu-order line mapping. |

Numbering uses `PaymentConfirmationSequence` with `_id = pc_<year>` (Zagreb calendar year).

### `invoice/`

Local PDF of a fiscalized Billko invoice. Billko fiscalizes; this module renders a customer-facing PDF.

| File | Role |
| --- | --- |
| `htmlRenderer.js` | Fills `templates/invoice.html` from `BillkoInvoice.rawResponse` + seller extras. |
| `htmlToPdf.js` | HTML → PDF via Puppeteer, or headless Chrome `--print-to-pdf`. Reused for confirmations. |
| `pdf.js` | Generate, Azure-cache, fetch for download, email ticketing PDFs once both ticket + fee invoices exist (billing email first). Download/email always generate a locale-correct PDF; Azure cache is a fallback store, not the source of truth for language. |
| `subscriptionBuilder.js` | Builds the Billko payload for organizer subscription e-invoices (seller = Pleis). |

### `models/`

| Model | Collection purpose |
| --- | --- |
| `BillkoInvoice` | One row per `(orderNumber, kind)`. Stores Billko ids, fiscalization number (JIR), fiscal protection code (ZKI), status, product snapshot in `rawResponse`, PDF Azure keys. |
| `PaymentConfirmation` | One issued confirmation per `(orderId, module)` plus optional cancellation row (`cancelsConfirmationId`). Tracks `deliveryStatus` and optional `customerUserId` for app open. |
| `PaymentConfirmationSequence` | Yearly counter for `PC-YYYY-########`. |

Invoice `kind` values: `service_fee`, `tickets`, `menu_items`, `reservation`, `subscription`, `commission`, `refund_storno`.  
Sellers: `pleis` (Pleis API key) or `organizer` (organizer Billko key).

### `locales/`

`en.js` / `hr.js` hold all user-facing strings (document labels, email subjects, invoice PDF labels). `index.js` resolves the user’s language (`hr` default) and formats payment-method labels.

### `templates/`

Mustache-style `{{TOKEN}}` HTML:

- `invoice.html` — fiscal invoice PDF source
- `invoice-email.html` — Mailgun covering HTML for ticketing invoice PDFs
- `confirmation.html` — confirmation document (PDF source; optional `data-block="voucher"` / `data-block="cancellation"`)
- `confirmation-email.html` — Mailgun covering HTML for confirmations (PDF attached)

### `shared/`

`html.js`: Europe/Zagreb date formatting, HTML escaping, token replacement. Used by both invoice and confirmation renderers.

### `scripts/`

`verifyPaymentRedesign.js` — in-process checks and HTML previews under `tmp/payment-confirmation-previews/`. No Mongo, Monri, or Billko HTTP.

---

## How a payment becomes a document

```
Payment succeeds (Monri webhook / dummy charge / staff POS)
        │
        ▼
enqueueFiscalDocument({ kind, orderId })     backend/bullmq/queues.js
        │  jobId = `${kind}-${orderId}`  (idempotent enqueue)
        ▼
BullMQ queue "fiscal-documents"  (8 attempts, exponential backoff)
        │
        ▼
fiscalDocumentsWorker
        │
        ▼
jobs/documentService.handleSuccessfulPayment
        │
        ├── ticketing_invoices      → Billko (Pleis fee + organizer tickets) → PDF email
        ├── subscription_invoice    → Billko (Pleis e-invoice to organizer)
        ├── ordering_confirmation   → PaymentConfirmation PDF + covering email
        └── reservation_confirmation→ PaymentConfirmation PDF + covering email (+ voucher if min-spend)
```

Enqueue sources:

- `paymentsWebhook/services/paymentWebhookService.js` after Monri marks an order paid
- Dummy-charge finalizers (ticketing / menu / reservation / subscription)
- Staff and admin in-app ordering services (cash / card captured in venue)
- `admin/ticketing/testPayTicketingOrder.js`
- `admin/reservation/testPayUserReservation.js`

Mapping from order type:

| Order type | Job kind | Document |
| --- | --- | --- |
| `ticketingbookings` | `ticketing_invoices` | Fiscal invoices + payment confirmation |
| `menuorders` | `ordering_confirmation` | Payment confirmation (PDF) |
| `userreservations` | `reservation_confirmation` | Payment confirmation (PDF) |
| `subscription` | `subscription_invoice` | Fiscal e-invoice |

---

## Ticketing invoice flow

1. Load paid `TicketingOrders` + bookings + billing + organizer + event.
2. If Pleis collected a service fee (`orderPricing.taxAmount`), create a `service_fee` invoice on **Pleis** Billko (`FEE-…` unique codes).
3. Create a `tickets` invoice on the **organizer** Billko account (`TCK-…` unique codes), with the commercial-agent attribution note on each product and at invoice level (`Stavka zaračunata u ime i za račun Organizatora: …`).
4. Persist each as `BillkoInvoice`, generate HTML → PDF, upload to Azure.
5. When the tickets invoice exists, email both PDFs once (`pdfEmailedAt`).
6. Issue a `TICKETING` payment confirmation (event title/schedule/venue, ticket types, `TBK-…` IDs, service fee) and email the covering message with PDF attached.
7. Later Billko callbacks update `fiscalizationNumber` / `fiscalProtectionCode` / status via `applyBillkoCallback` and may retry PDF store + email.

Refunds: Monri refund handler issues a cancellation confirmation when a `PaymentConfirmation` exists (marks original `CANCELLED`, cancels min-spend voucher), and calls `stornoTicketingInvoices` for ticketing orders.

### Ticket storno env gate

- `BILLKO_STORNO_ENABLED` must be exactly `true` for live Billko calls. Unset / any other value → dry-run (`executed: false`, `reason: live_billko_storno_disabled`) with a planned mode per invoice.
- Monri live card refunds are separately gated by `MONRI_LIVE_REFUND_ENABLED` (also default off).
- Full ticket refund amount (≥ ticket invoice amount, or amount omitted) → `POST /invoices/refund` on the organizer ticket invoice; original row marked `refunded`.
- Partial amount → `createInvoice` with `transactionType: 1`, `referentDocumentNumber` + `referentDocumentDT`, persisted as `kind: refund_storno` (`{orderNumber}-RST-{n}`). Service fee invoices are never cancelled by default (Billko §4.5).

### Mailgun delivery webhook

`POST /api/v1/webhooks/mailgun/delivery` maps Mailgun `delivered` / `bounced|failed` events onto `PaymentConfirmation.deliveryStatus`. Auth: HMAC signature (`MAILGUN_WEBHOOK_SIGNING_KEY` or `MAILGUN_API_KEY`) and/or `x-mailgun-webhook-secret` matching `MAILGUN_WEBHOOK_SECRET`. Matching prefers `emailMessageId` (stored from Mailgun send `id`), then `confirmationNumber` (+ recipient). Updates are idempotent; bounce never deletes the confirmation.

---

## Ordering / reservation confirmation flow

1. Load paid menu order or reservation; skip if not paid (or reservation amount ≤ 0).
2. Resolve organizer legal party (`getOrganizerParty`), customer name/email, locale, card snapshot from `MonriTransaction`.
3. Reservations with `minimumSpendOnLocation` add a `PLS-XXXX-XXXX-XXXX` voucher and a zero-priced option line plus a prepayment line.
4. `issuePaymentConfirmation`:
   - Reuse existing confirmation for the same order + module if present (finish PDF store / email if incomplete).
   - Else allocate `PC-YYYY-########`, save the Mongo row, render HTML → PDF, hash PDF bytes, upload Azure, email covering message with PDF attached.
5. Customer gets Mailgun covering HTML + PDF attachment. Authenticated clients can open `/fiscal-documents/confirmations/:confirmationNumber` (redirects to Azure PDF). Emails also link `/app/open?id=…` to jump into the app wallet.

Cancellation confirmations (`issueCancellationConfirmation`) allocate a new PC number, point `cancelsConfirmationId` at the original, mark the original `CANCELLED`, and set reservation `voucher.status` to `cancelled` when a voucher exists.

---

## How the pieces call each other

```
api/controller
  ├── models/PaymentConfirmation, models/BillkoInvoice
  ├── api/access
  └── invoice/pdf.fetchInvoicePdf / storeInvoicePdfIfAvailable

confirmation/generator
  ├── models/PaymentConfirmation + PaymentConfirmationSequence
  ├── confirmation/htmlRenderer → templates/confirmation*.html + locales + shared/html
  ├── confirmation/helpers
  ├── api/openAppRedirect.buildConfirmationOpenUrl
  ├── Azure upload
  └── Mailgun

invoice/pdf
  ├── invoice/htmlRenderer → templates/invoice.html + locales + shared/html
  ├── invoice/htmlToPdf
  ├── Azure upload
  └── Mailgun (ticketing PDFs)

jobs/documentService
  ├── confirmation/generator          (ordering + reservation)
  ├── invoice/pdf + invoice/subscriptionBuilder
  ├── models/BillkoInvoice
  └── paymentsIntegrations/billko/*   (client, credentials, invoice builder, tax labels)
```

Outside this folder, the module is a dependency of:

- `backend/bullmq/` — queue + worker
- `backend/commonModules/paymentsIntegrations/billko/` — fiscalization API and callback
- `backend/commonModules/paymentsIntegrations/monri/` — refund → cancellation confirmation
- Payment finalizers / webhook — enqueue jobs

---

## Locales and storage

- Default locale is **hr**. User `language` is mapped in `locales/index.js`.
- Confirmation PDF is stored on Azure; the Mongo row keeps `pdfFileUrl` + `documentHash` (SHA-256 of PDF bytes).
- Confirmation email delivery is tracked with `deliveryStatus` (`pending` → `sent` when Mailgun accepts; `delivered` / `bounced` via `POST /webhooks/mailgun/delivery`). `emailMessageId` is stored on send for webhook matching. `emailSentAt` keeps send idempotent — regenerating the PDF does not resend unless `forceResend` is set.
- Invoice PDFs are generated locally from stored Billko product/billing snapshots. Azure `pdfFileUrl` is a cache; downloads regenerate so language matches the buyer.
- Billko invoices store `fiscalizationNumber` (JIR) and `fiscalProtectionCode` (ZKI) when Billko returns them; the invoice PDF shows ZKI only when present.
- Ticket types store `taxRateLabel` (`Tg0`–`Tg4`). Invoice products prefer that label; percent→label remains a fallback for legacy rows. Publish/sell requires a resolvable label.
- Ticketing service fee uses DOC formula: `min(base, 30 EUR) + 8% of item` in integer cents (see `backend/config/CONSTANTS.js`). Original 6% flat rate is kept commented for restore.

---

## Quick verification

```bash
node backend/commonModules/fiscalDocuments/scripts/verifyPaymentRedesign.js
```

Writes HTML previews to `tmp/payment-confirmation-previews/` and asserts wiring (job kinds, enqueue sites, template tokens, ZKI, deliveryStatus, tax labels, Billko storno env gate, partial storno path, Mailgun delivery webhook).
