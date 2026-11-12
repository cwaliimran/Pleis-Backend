# HANDOFF — M1 Defects / M2 Beta P1 Payments (Monri): #23, #24, #25, #65, #66, #67, #89

Written 12 Nov 2026 at the end of a long session. Read `/Users/ali/Documents/GitHub/Pleis/PLEIS-WORKSPACE.md` first, then the Requirement Set v13.8 entries: `grep -n "^#2[345] \|^#6[567] \|^#89 " tmp/v3/mds/Pleis_Requirement_Set_v13_8_27102026.md`. Monri spec: `tmp/v3/mds/Pleis_Monri_Integration_v1_4.md` §3 (flow, rules) and §4 (method matrix).

## 1. Current goal

Finish the seven payment items the user pasted:

| # | Item | Status |
|---|---|---|
| 25 | Webhook-driven success gate; daily reconciliation | **Done** (backend) |
| 89 | On-site payment, Mark as Paid / Unpaid only off-app | **Done** (backend, admin panel, staff app rules) |
| 67 | Checkout billing data, person / company + OIB, save to profile | **Done** (backend + guest app form). Not yet run on the emulator |
| 24 | Payment settings: in-app + Off App Payment Options | Mostly done earlier (#68). **Check** the admin settings screen greys out Pay now while In-app is off |
| 66 | Payment method selector on place order | Done earlier (#68). **Check** the app clears a selection the venue switched off |
| 23 (part) / 65 | Aircash and KEKS Pay; checkout with all methods in the app | **Not started** — see next steps |

## 2. Completed work this session (all uncommitted)

### #89 — Mark as Paid / Mark as Unpaid only where the venue collects the money
- `backend/commonModules/menuItemsAndOrders/orderLifecycle.js`: `assertPaymentTransition(order, next, {paymentMethod})` throws 409 `payment_status_set_by_monri` for card / applePay / googlePay. `resolveStaffNextActions` omits mark_paid / mark_unpaid for Pleis methods (Cancel stays).
- `backend/commonModules/menuItemsAndOrders/Orders.js`: new `manualPaymentStatus {action, paymentMethod, paymentMethodLabel, at, by, byName, byRole, via}`.
- `backend/admin/inAppOrdering/ordermanagement/inAppOrderingService.js`: the payment-method block now runs BEFORE the payment-status block, accepts only an enabled off-app method (`OFF_APP_METHODS` + `enabledMethodsFor(getSetttings)`), and the order is saved before `menuOrderFinalizerService` so the ledger row gets the new type. Mark as Paid / Unpaid writes `manualPaymentStatus`.
- Controllers pass `byName` / `byRole` / `via` (admin + staff). The staff app's PUT `/app/staff/in-app-ordering/:id` uses this same admin service.
- Admin panel `sections/app-ordering/order-management-v2/constants.ts`: `MARK_AS_PAID_PAYMENT_TYPES = ['cash','cardTerminal','other']` (was `['card','cash']`, card = Monri); Mark as Unpaid checks the type too.
- Staff app `src/pages/ordering/OrderingV2/enums.js` (CARD removed) and `orderActions.js` (unpaid checks type).
- Tested: card order → both actions refused, unchanged; switched-off method refused; cash Mark as Paid → `manualPaymentStatus` recorded, ledger row offapp / EXCLUDED. Test clone + its side effects removed (wallet points and global streak restored).

### #67 — billing data
- `backend/app/userBillingInformation/userBillingInformationController.js`: `normalizeBillingParty` — type person/company (or 1/2); company needs `companyName` + valid OIB (`isValidOib`, mod-11). Create and update. Update now checks ownership (another user's id → not found).
- `...Service.js`: allowed fields + `type`, `companyName`, `personalIdentificationNumber`, `phone`; owner check.
- Locales en/es: `billing_type_invalid`, `billing_company_name_required`, `billing_oib_invalid`.
- Guest app `src/components/checkout/BillingAddressForm.js`: name required (was "optional", the backend already required it and saves failed silently), "Buying as a company" checkbox → Company name + OIB fields with Yup validation; `src/utils/checkout/billingUtils.js`: `isValidOib` (verified identical to the backend on 20,000 numbers), payload `type` / `companyName` / `personalIdentificationNumber`. Locales en/hr added. "Save for future purchases" already existed (unticked → status `deleted`, kept off the profile list).
- Documents already use the checkout email first (`documentService.js`, `invoice/pdf.js`); Billko type 1/2 mapping already in `billkoInvoiceBuilder.buildBillingInformation`.

### #25 — success gate + daily reconciliation
- New `backend/commonModules/paymentsIntegrations/monri/monriCaptureCheck.js` (`confirmMonriCapture(orderNumber, {persist})`), moved out of `monriWebhookController.js` (which now imports it).
- `monriController.handleSuccess` (the success redirect = client returning) now runs the server-side status query before fulfilling; unconfirmed → 200 "Payment pending", `orderFulfilled:false`, left for the callback / 15-min reconcile. Tested with a correctly signed redirect for an unknown payment → pending, nothing issued.
- New `ledger/documentReconciliationService.js` + `DocumentReconciliationReport.model.js`: DOCUMENT_WITHOUT_CAPTURE (confirmations + guest-payment Billko invoices) and CAPTURE_WITHOUT_DOCUMENT (pleis track, older than 6 h). Cron 03:30 daily in `backend/config/cron/index.js`. Manual run: `NODE_ENV=prodtest node backend/scripts/runDocumentReconciliation.js`.
- Local result: 0 documents without capture, 6 captures without a document (expected locally: Billko not configured). Planted test confirmation was detected, then removed.
- Audit: ordering / reservation confirmations are queued only when paid; reservation voucher issued only in the finalizer's paid branch; ticket invoices from the finalizer.

## 3. Current state
- Nothing committed (user rule: commit only when asked; never push without explicit confirmation).
- nodemon backend on :4020 (`NODE_ENV=prodtest`), admin panel :4003. Test tokens: scratchpad `api.sh` from the earlier session may be gone in a new session — mint new ones (see `pleis-local-test-setup` memory).
- Local organizer login for testing: `pleistest@pleis.hr` / `123456` (local DB only; set this session).
- **Files changed by someone else during this session — do not mix into my commits:** backend `admin/qr/*`, `organizer/qr/*`, `app/qrCode/qrCodeRoutes.js`, `commonModules/qrCode/models/QR/*`, `config/CONSTANTS.js`, `helperUtils/appDeepLinkUtil.js`, `routes/index.js`, `routes/shareRoute.js`, `server.js`; plus the older unrelated ones (menuItemImport*, clubMembersRepository, userWalletRepository, xlsxWriter, authController, Devices.js). Staff app and guest app also have older unrelated uncommitted changes.
- Also uncommitted from earlier today: #8 / #10 / #129 / #130 (transaction list, ledger, edit order) — see QA reports ADM-28..31; sidebar renamed to "Transaction list" per spec; analytics Member Activity empty state; order list 2-decimal amounts; transactions-history-v2 column widths.

## 4. Immediate next steps
1. **#23 / #65 Aircash + KEKS Pay** (Monri v1.4 §4.1): stored as `keks_pay` / `aircash` (backend enum names: add `keksPay`, `aircash` alongside `card/applePay/googlePay` in `commonModules/menuItemsAndOrders/paymentMethods.js` PLEIS_METHODS, labels "KEKS Pay" / "Aircash", `isPleisMethod`, ledger / transaction-list labels, `normalizeDbPaymentMethod` in `monri/monriController.js`, MonriTransaction paymentMethod enum). Billko paymentType 0 Other: check `mapGatewayPaymentType` in `fiscalDocuments/jobs/documentService.js`. App: hosted checkout page in an in-app browser rendering Monri Components `keks-pay` / `air-cash` for one attempt (there is already a Components page in `monriController.redirectToMonriWalletPay` and the Components branch of `createWebPaySession` — extend that), must hand off to the KEKS/Aircash app and return. Order shown: saved cards, Apple/Google Pay, Card, KEKS Pay, Aircash. Never saved, never for subscriptions. Check Monri Components docs for the exact component names / options before coding.
2. Amount check (spec §3.2) — **DONE for menuorders, ticketingbookings, userreservations** (user: "backend computes, verifies on payment request"). `monriController.assertAmountMatchesOrder` in `createWebPaySession`: sent cents must equal the stored total (menuorders `totalPrice`; ticketingorders `orderPricing.total`; userreservations `amount` = reservation after promo + pre-order), owner must match, not already paid → else 409 `payment_amount_mismatch` / 404 / 409 `order_already_paid`. Tested: wrong amount refused, other user 404, correct amount → Monri link. Guest app `CheckOut.js` now charges the backend total from the create response (`order.orderPricing.total` for tickets, `amount` for reservations) — it used to charge its own computed total; a local ticket payment shows the old formula charged €4.24 on a €7.32 order. Placement already prices server-side (menu, tickets, reservations; no client total read).
   **Still open:** `combinedBooking` and `tickettransfer` order types pass unverified (logged `[monri] amount not verified`) — find their stored totals and add them. `/redirect`, `/wallet-pay`, `/payment-intent` are unauthenticated and take the amount from the query — check whether anything still uses them; if not, remove the routes (ask the user first). Ticket checkout on the emulator not run yet.
3. Check #24 (admin settings: Pay now greyed while In-app off) and #66 (app clears a switched-off selection).
4. Run the guest app billing form on the emulator (OCR via `ClaudeOCR/screen.sh`, never view screenshots).
5. Update QA reports `tmp/v3/implementations/` (admin-panel ADM-32+, mobile MOB-16+, index coverage rows for 25, 65, 66, 67, 89, 24, 23).
6. Report to the user and ask before committing.
