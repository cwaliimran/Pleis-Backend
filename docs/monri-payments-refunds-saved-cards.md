# Monri payments, refunds and saved cards

How guest payments with Monri work for menu orders and reservations: the
order created before payment, the hosted payment form, how a payment is
confirmed, unpaid orders that expire, refunds, and saved cards (tokens). It also
lists the env settings to switch on before production and how to test.

Spec: Monri Integration v1.4 (§3 payment, §5.1 saved cards, §6 refunds,
§8 card data, §10 merchant setup); Requirement Set v13.8.

## How a payment works

```
Guest taps Pay
  1. App creates the order (or reuses the unpaid one, see below)
  2. App opens   GET  /api/v1/app/payments/monri/web-pay-session
                      ?amount=<cents>&orderNumber=<order id>&orderType=menuorders
                      &paymentMethod=card[&savedCardId=<id>]
  3. Backend checks the amount against the order, creates a MonriTransaction
     (status pending), posts the form to Monri  POST {MONRI_BASE_URL}/v2/form
     and returns { payment_url }
  4. App shows payment_url in a WebView: card (or CVV only for a saved card) + 3DS
  5. Monri redirects to SUCCESS_URL or CANCEL_URL
     → the app catches the URL and closes the WebView
     → the backend handles /payments/monri/success
  6. Backend asks Monri for the order status (/orders/show) before marking it paid
```

- **The order always exists before the payment.** Monri needs the order id as
  `order_number`, and a payment can never arrive without an order.
- **Pay-now orders are hidden** (`hideUntilPaid`) from staff until they are
  paid. The Wallet doesn't list them either.
- **Pay again uses the same order.** The app keeps the unpaid order per venue
  (`appOrdering.unpaidOrders`). When the guest pays again for the same
  reservation, the app updates that order (`PUT` with the new basket) and opens
  Monri for it again. It doesn't create a second order.
- **The success redirect is not proof of payment.** The guest's phone loads it,
  so the backend asks Monri (`/orders/show`, digest `SHA1(key + order_number)`)
  whether the money was captured. When Monri doesn't confirm, the transaction
  stays pending and the reconcile job settles it.
- **A declined card fails the attempt, never the order** (Monri v1.4 §3.1).
  The order keeps its status and stays unpaid, so the guest can pay again:
  a delivered pay-later order stays *Waiting for payment*. No "order
  cancelled" notice is sent. An unpaid pay-now order that is never paid is
  closed by the expiry job when its lock runs out.
- **Buyer name in Monri** is taken from the guest's billing details. When there
  are none, it uses the account's first and last name, then the username. Email
  works the same way. "Guest User" appears only when all of these are empty.

### Code

| Part | File |
|---|---|
| Routes | `backend/commonModules/paymentsIntegrations/monri/monriRoutes.js` (mounted at `/api/v1/app/payments/monri`) |
| Payment form, success, cancel, admin refund | `monri/monriController.js` |
| Monri status check | `monri/monriCaptureCheck.js`, `monri/monriService.js` |
| Reconcile job | `monri/monriReconcileService.js` |
| Refund call to Monri | `monri/refundService.js` |
| Transaction record | `monri/MonriTransaction.js` |
| Unpaid order expiry | `backend/commonModules/menuItemsAndOrders/unpaidOrderExpiryService.js` |
| Order refund | `backend/commonModules/menuItemsAndOrders/orderRefundService.js` |
| Voucher give-back | `backend/commonModules/menuItemsAndOrders/orderVoucherRelease.js` |
| Saved cards | `backend/commonModules/paymentsIntegrations/usersPaymentsCards/` (Add card: `services/userCardAddService.js`) |
| App: Profile > Payment methods | Pleis-Mobile-Apps `src/pages/paymentMethods/PaymentMethods.js` |
| App: default method | Pleis-Mobile-Apps `src/utils/checkout/defaultPaymentMethod.js`, `src/hooks/usePreselectSavedCard.js` |
| Cron jobs | `backend/config/cron/index.js` |
| App: payment page | Pleis-Mobile-Apps `src/pages/webPayment/WebPayment.js` |
| App: session URL | Pleis-Mobile-Apps `src/utils/checkout/monriPaymentUtils.js` |

---

## Background jobs

Crons run only on the `worker` (or `all`) role, never on `APP_ROLE=api`. Each one
holds a Redis lock, so only one server runs it at a time.

| Job | When | What it does |
|---|---|---|
| Monri reconcile (`cron:reconcile-monri-payments`) | Every 10 min | Pending transactions between 15 min and 24 h old: asks Monri and marks them paid (runs the normal paid path) or failed |
| Unpaid order expiry + refund retry (`cron:expire-unpaid-paynow-orders`) | Every 5 min (`2-59/5`) | Expires unpaid pay-now orders, then retries the refunds that are due |

## Unpaid orders expire

A pay-now order has `lockUntil` (10 minutes after it was placed). When it has
passed and the order is still unpaid, the job decides by the Monri transaction:

| Monri transaction | Result |
|---|---|
| None (Monri never opened) | Order expired |
| Failed, cancelled or invalid | Order expired |
| Pending | Asks Monri first. Captured: the order is paid, never expired. Declined: the attempt is failed and the order expires. No answer: expired only 30 min after the last attempt, so a guest still on the 3DS page isn't cut off |
| Paid or refunded | Left alone |

When an order expires:

- `status` becomes `expired` and `lockUntil` is cleared.
- The voucher amount the order drew from the reservation voucher
  (`priceBreakdown.voucherDiscount`) is given back.
- The Monri transaction becomes `cancelled`.
- The guest's app gets `ORDER_UPDATE`. Staff never see the order.

The job checks at most 5 orders with Monri per run. It stops asking after 2 bad
answers and leaves those orders for the next run.

**Late capture:** when a payment for an order that already expired or was
cancelled is confirmed afterwards, the payment is recorded and refunded
automatically (`late_capture`). The order is not reopened, and no ledger row or
fiscal document is created for it.

---

## Refunds

### When a refund happens

| Trigger | Reason code | Who |
|---|---|---|
| Staff or admin cancels or rejects a paid order | `order_rejected_after_capture` | Staff app, admin panel |
| Payment confirmed after the order expired or was cancelled | `late_capture` | Automatic |
| Superadmin refund by order number | `admin_refund` | `POST /api/v1/app/payments/monri/refund` with `{ "orderNumber": "<order id>" }` (admin users only, others get 403; 503 while `MONRI_LIVE_REFUND_ENABLED` is off) |

Only orders paid **through Pleis** are refunded: Monri card, Apple Pay, Google
Pay, the reservation voucher, or a mix of card and voucher. An order the venue
was paid for directly (cash, terminal) still can't be cancelled once paid
(`Cant_Cancel_paid_order`).

Reservations are not refundable. Loyalty points stay with the guest.

### Rules

- **Full refund only, at most once per order.** The order's `refund` field is
  claimed atomically, so two cancels at the same time send one refund.
- **Before payout only.** If the order is already in a statement, the cancel is
  refused (`refund_blocked_by_statement`: cancel the statement first). If it
  was already paid out (`refund_after_payout_organizer_refunds`), the organizer
  refunds the guest directly.
- **Card part:** sent back to Monri on the original `order_number`.
  **Voucher part:** given back to the reservation voucher. An order paid fully
  by voucher needs no Monri call.

### The Monri refund call

```
POST {MONRI_BASE_URL}/transactions/{order_number}/refund.xml
Content-Type: application/xml

<transaction>
  <amount>4000</amount>            cents, the full captured amount
  <currency>EUR</currency>
  <digest>SHA1(key + order_number + amount + currency)</digest>
  <authenticity-token>…</authenticity-token>
  <order-number>…</order-number>
</transaction>
```

It counts as done only when the reply says `status = approved`.

### What happens with each answer

| Monri answer | Order `refund` | Next |
|---|---|---|
| Approved | `refunded` | Order `paymentStatus: refunded`, voucher given back, Monri transaction `refunded`, payment confirmation cancelled (storno), live update to the apps, guest notification "Order Refunded" |
| `MONRI_LIVE_REFUND_ENABLED` is not `true` | `failed`, `lastError: live_refund_disabled` | Tried again every hour until the setting is on |
| Never reached Monri (Cloudflare 521/522/523, tried 3 times) | `failed` | Tried again after 10 min |
| Declined (or a 4xx error) | `failed`, `attempts + 1` | Tried again once after 24 h. After a second decline: `needsOperations` |
| No answer (timeout, 5xx, Cloudflare 524) | `pending`, `needsOperations` | **Never sent again automatically.** The refund may have gone through: check in the Monri portal first |

### Orders that need operations

```js
db.menuorders.find({ "refund.needsOperations": true },
  { orderNumber: 1, refund: 1, totalPrice: 1 })
```

1. Look the order up in the Monri portal (Transactions, search by order
   number = the order `_id`), or query the status:
   ```bash
   # digest = SHA1(MONRI_KEY + order_number)
   curl -s -X POST "$MONRI_BASE_URL/orders/show" -H "Content-Type: application/xml" \
     -d "<order><order-number>$ORDER</order-number><authenticity-token>$TOKEN</authenticity-token><digest>$DIGEST</digest></order>"
   ```
2. **Monri shows the refund** (`transaction_type` refund, `status` approved):
   record it on the order (`paymentStatus: refunded`, `refund.status: refunded`)
   and give the voucher back.
3. **No refund at Monri:** set `refund.status: failed`,
   `refund.needsOperations: false` and `refund.nextRetryAt` to now. The next
   job run sends it again.

### What the apps show

| App | Paid Pleis order | After the refund |
|---|---|---|
| Staff app | Cancel stays available | Badge "Refunded", order in the past list |
| Admin panel | Cancel stays available | Badge "Refunded" |
| Guest app | — | Wallet: past section. Notification "Order Refunded — Your payment for order … has been refunded in full." |

Not built yet (on hold): the reverse ledger row and the 2 % refund cost row
(spec §6.1, §6.5).

---

## Saved cards (tokens)

### Saving a card

The guest never types a card number into the app. A card is saved in one of
two ways, both on Monri's own pages.

**While paying**

1. A guest paying with a new card sees Monri's **"save card"** checkbox on the
   payment page, unticked. The backend asks for it with
   `tokenize_pan_offered=true` when `MONRI_TOKENIZATION_ENABLED=true` and the
   guest has fewer than 5 cards.
2. When the guest ticks it and Monri confirms the payment, Monri sends back a
   `pan_token` and `masked_pan`. The backend saves the card on the guest's
   account.
3. The same card saved again (same brand and masked number) updates the
   existing card. Its token is refreshed.

**From the Profile: Profile > Payment methods > Add card**

```
App      POST /cards/add-session              → { page_url }
Backend  POST {MONRI_BASE_URL}/v2/payment/new
           scenario add_payment_method, transaction_type authorize, 100 cents
App      opens page_url in the payment WebView
Page     Monri card component (3-D Secure inside it) → confirmPayment
Page     POST /cards/add-complete/:attemptId  { t, result }
Page     → /cards/add-result?status=saved|failed   (the app closes on this URL)
```

- **No money is taken.** Monri authorizes 1.00 € to check the card and voids it
  itself (that is what `add_payment_method` does).
- **One attempt per tap** (`CardSaveAttempt`): it links the Monri order number
  to the guest. The page and its result call are reached only with a random
  page token. The token is stored hashed, is single use and expires after
  30 min.
- **Monri sends the result to the page, not to our backend**, so the backend
  accepts it only for that guest's own attempt. A forged token couldn't be paid
  with: Monri refuses it on the payment form and the card is marked expired.
- **The page has its own Content-Security-Policy.** Our script runs with a
  nonce, and Monri's script, card iframe and API calls are allowed. The
  app-wide policy would block them.
- **Stored with the card:** the expiry (from Monri), `createdVia: profile` and
  `consentTextVersion: pleis-add-card-v1` (the text shown on the page).
- **Turned off:** while `MONRI_TOKENIZATION_ENABLED` is off, or Monri refuses
  tokenization, the app shows *"Saving cards is not available yet."*

**Limit:** 5 cards per guest. An expired card counts until the guest deletes
it. At 5, both Monri's save box and Add card are switched off, and the screen
says *"You can save up to 5 cards. Delete a card to add a new one."*

How the token is kept:

- Encrypted with AES-256-GCM (`BILLKO_ENCRYPTION_KEY`), in
  `UserCard.panTokenEncrypted`.
- Never returned by the API and never sent to the app.
- Removed from the stored Monri callback (`rawCallback`).

The guest sees only the brand and the last 4 digits.

### Paying with a saved card

1. The guest picks the card in the app's payment sheet. The app sends
   `savedCardId` with the session request.
2. The backend decrypts the token and sends it to Monri as
   `supported_payment_methods=<token>`.
3. Monri shows the masked card and asks only for the **CVV** (and 3DS when the
   bank asks for it).

A card is never charged without the guest on the payment page.

If Monri says the token is no longer valid, the backend marks the card
`expired` and answers 409 `saved_card_invalid`. From then on the card is shown
as **Expired** and can't be selected (§5.1). The guest deletes it, or adds the
card again.

**Default method** (§4.1, §4.2): the first usable saved card is preselected.
Without one, the default is Apple Pay on iPhone and Google Pay on Android.
Apple Pay is never offered on Android, and Google Pay never on iPhone. The
guest's own choice always wins.

### Card endpoints (`/api/v1/app/payments/cards`)

| Method | Path | Result |
|---|---|---|
| GET | `/` | The guest's Monri-saved cards, usable first, expired ones flagged `expired: true`; never the token |
| DELETE | `/:cardId` | Removes the card |
| POST | `/add-session` | Starts Add card: `{ page_url }`. 409 `card_saving_unavailable` or `max_saved_cards` |
| GET | `/add-page/:attemptId?t=` | The Add card page (no app login; reached with the page token) |
| POST | `/add-complete/:attemptId` | The page's Monri result: `{ status: saved\|failed, code }` |
| GET | `/add-result` | Last page of the WebView; the app closes on it |
| PATCH | `/:cardId/default` | Sets the default card |
| POST | `/` | 410 `card_saved_on_payment_only` (cards are saved only through Monri) |
| POST | `/charge` | 410 `saved_card_paid_on_monri_form` |

Cards saved by the old in-app form (`source: legacy`) had made-up tokens. They
are hidden and can't be used.

### Turning saved cards on

The Monri merchant account must have **tokenization ("secure vault")** enabled by
Monri (§10). Until then, Monri refuses the form with *"pan tokenization has been
requested, but the account does not support it"*.

1. Ask Monri to enable tokenization on the merchant account (test and
   production).
2. Ask them to send `pan_token` on the success redirect (or the callback).
   Without it, payments work but no card is saved.
3. Set `MONRI_TOKENIZATION_ENABLED=true` and restart the service.
4. Test: pay with the test card, tick "save card", then check that the card
   appears in the payment sheet. Pay again with it: only the CVV is asked.
   Then Profile > Payment methods > Add card with the test card: 3-D Secure,
   "Card saved", and the card listed with its expiry.

Safety net: if the setting is on but Monri still refuses tokenization, the
backend opens the form again without the save box, so the guest can still pay.

---

## Env settings

| Variable | Value | Notes |
|---|---|---|
| `MONRI_BASE_URL` | Test: `https://ipgtest.monri.com`<br>Live: `https://ipg.monri.com` | Every env file uses the test host today |
| `MONRI_KEY`, `MONRI_AUTH_TOKEN` | From the Monri portal (Settings) | Secret. Test and live keys differ |
| `MONRI_COMPONENTS_ENV` | `test` or `prod` | Apple Pay / Google Pay components |
| `MONRI_CURRENCY`, `MONRI_LANGUAGE`, `MONRI_COUNTRY`, `MONRI_LOCALE` | `EUR`, `en`, `HR`, `en-US` | |
| `MONRI_WEBHOOK_SECRET` | From Monri | |
| `SUCCESS_URL` | `https://<backend host>/api/v1/app/payments/monri/success` | **Must be HTTPS.** Monri refuses `http://` |
| `CANCEL_URL` | `https://<backend host>/api/v1/app/payments/monri/cancel` | Same |
| `MONRI_LIVE_REFUND_ENABLED` | `true` to send refunds | `false` in every env file today: refunds wait and are retried every hour. **Set it on both the API and the worker** |
| `MONRI_TOKENIZATION_ENABLED` | `true` once Monri has enabled tokenization | Not set = off (no save box) |
| `BILLKO_ENCRYPTION_KEY` | 32-byte key | Encrypts card tokens. Changing it makes saved cards unusable |

## Before production

1. Set `MONRI_LIVE_REFUND_ENABLED=true` on Azure (API and worker) and restart.
   Refunds that were waiting go out on the next job run.
2. Ask Monri to enable tokenization, then set `MONRI_TOKENIZATION_ENABLED=true`
   (see "Turning saved cards on").
3. For live payments, switch `MONRI_BASE_URL`, `MONRI_KEY`, `MONRI_AUTH_TOKEN`
   and `MONRI_COMPONENTS_ENV` to the live account.
4. Check that `SUCCESS_URL` and `CANCEL_URL` point at the production host over
   HTTPS.
5. Make sure the worker is running. Without it, unpaid orders never expire,
   their vouchers are never given back, and refunds are never retried.

---

## Testing

### Test card (Monri test host)

| Field | Value |
|---|---|
| Card | `4341 7920 0000 0044` |
| Expiry | `12/30` |
| CVV | `123` |
| 3DS | Press **Authenticate** on the test page |

### Local backend

- Monri only redirects to HTTPS addresses, so the local env files use the
  **production** success and cancel URLs. The app catches the redirect URL
  before the page loads, so it still works. The local backend then confirms
  the payment with Monri itself.
- A fully local redirect needs an HTTPS tunnel set as `SUCCESS_URL` and
  `CANCEL_URL`.
- The Monri test host is behind Cloudflare, and some countries are blocked. On
  the Android emulator, set the location to an EU country (Extended controls →
  Location).
- The test host often answers with Cloudflare 522. Opening the payment page
  retries automatically, and refunds are sent again after 10 min.

### Checks

```bash
# Payment verification script (prints ALL PASS)
node backend/commonModules/fiscalDocuments/scripts/verifyPaymentRedesign.js
```

| Scenario | Expected |
|---|---|
| Pay, cancel the WebView, pay again | Same order id, one order |
| Leave an order unpaid for 10+ min | Order `expired`, voucher amount back, not in the Wallet |
| Pay, then staff cancels the order | Monri shows a refund, order `refunded`, guest gets "Order Refunded" |
| Cancel an order already in a statement | 409 `refund_blocked_by_statement` |
| Pay with a saved card whose token is invalid | 409 `saved_card_invalid`, card shown as Expired, not selectable |
| Profile > Payment methods > Add card (tokenization off) | "Saving cards is not available yet." |
| Add card with 5 cards saved | Button disabled, "You can save up to 5 cards…" |
| Android payment screen, no saved card | Google Pay selected, "Pay with Google Pay" |

Verified on the Monri test host: order ORD-0JKM2G, €40, test Visa with 3DS. It
was cancelled by staff, and the refund was approved by Monri (refund id 1364689).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Payment page blank or error "Success url override must be HTTPS" | `SUCCESS_URL` / `CANCEL_URL` is `http://` | Use HTTPS URLs |
| "pan tokenization has been requested, but the account does not support it" | Tokenization not enabled at Monri | Ask Monri (§10), or leave `MONRI_TOKENIZATION_ENABLED` off |
| "Saving cards is not available yet." on Add card | `MONRI_TOKENIZATION_ENABLED` off, or tokenization not enabled at Monri | See "Turning saved cards on" |
| No save-card box on the Monri page | Setting off, guest already has 5 cards, or tokenization refused (form opened again without it) | See "Turning saved cards on" |
| Card paid but not saved | Monri did not send `pan_token` on the success redirect | Ask Monri to send it (§10) |
| Buyer shows "Guest User" in the Monri portal | Payment made before the name fallback was added, or the account has no name | Fill in the account name or billing details |
| Order paid at Monri but still pending in Pleis | Guest left before the redirect, or Monri didn't confirm in time | The reconcile job settles it within ~25 min |
| Refund stays `failed` with `live_refund_disabled` | `MONRI_LIVE_REFUND_ENABLED` not `true` on the worker | Set it on the API and the worker |
| Refund `pending` with `needsOperations` | Monri gave no answer | Check the Monri portal first, never resend blind (see "Orders that need operations") |
| Cancel refused with `refund_blocked_by_statement` | Order is already in a statement | Cancel the statement first |
| Unpaid orders never expire | Worker not running (`APP_ROLE=api` runs no crons) | Run a `worker` or `all` instance |
