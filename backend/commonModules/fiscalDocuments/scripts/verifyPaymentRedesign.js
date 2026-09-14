#!/usr/bin/env node
/**
 * In-process payment-redesign verification. No Mongo, no Monri, no Billko HTTP.
 * Run: node backend/commonModules/fiscalDocuments/scripts/verifyPaymentRedesign.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../../..");
const PREVIEW_DIR = path.join(ROOT, "tmp/payment-confirmation-previews");
const PASS_LABEL = process.env.VERIFY_PASS || "1";
if (!process.env.API_BASE_URL) {
  process.env.API_BASE_URL = "http://localhost:4016/api/v1/";
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  PASS  ${label}`);
}

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractFn(src, name) {
  const start = src.indexOf(`async function ${name}`);
  const alt = src.indexOf(`function ${name}`);
  const from = start >= 0 ? start : alt;
  if (from < 0) return "";
  const next = src.slice(from + 1).search(/\nasync function |\nfunction /);
  return next < 0 ? src.slice(from) : src.slice(from, from + 1 + next);
}

function fixtureView(overrides = {}) {
  const paidAt = new Date("2026-09-10T10:00:00+02:00");
  const items = overrides.items || [
    { name: "Burger", vatPercent: 25, quantity: 1, unitPrice: 12, amount: 12 },
  ];
  return {
    pleisLegalName: "Utopia Technologies d.o.o.",
    pleisOib: "34839111725",
    pleisAddress: "Zagreb",
    pleisBrand: "PLEIS",
    pleisWeb: "https://pleis.hr",
    supportEmail: "support@pleis.hr",
    locale: "hr",
    confirmationNumber: "PC-2026-00000001",
    issuedAt: paidAt,
    issuedAtFormatted: "10. 09. 2026. 10:00:00",
    documentHash: "abc123hash",
    customerName: "Ana Test",
    customerEmail: "pleis-dummy-ana@example.invalid",
    customerFirstName: "Ana",
    transactionId: "txn-dummy",
    orderReference: "ORD-DUMMY1",
    paidAt,
    paidAtFormatted: "10. 09. 2026. 10:00:00",
    paymentMethod: "Kartica, Visa 4242",
    currency: "EUR",
    totalAmount: 12,
    organizerLegalName: "Dummy Venue d.o.o.",
    organizerVenueName: "Dummy Venue",
    organizerAddress: "Ilica 1, Zagreb",
    organizerOib: "00000000000",
    items,
    voucher: overrides.voucher,
    voucherValidFromFormatted: overrides.voucher ? "10. 09. 2026. 10:00:00" : "",
    voucherValidToFormatted: overrides.voucher ? "11. 09. 2026. 23:00:00" : "",
    itemRowsHtml:
      overrides.itemRowsHtml ||
      `<tr><td class="l">Burger</td><td>25%</td><td>1</td><td>12.00</td><td>12.00</td></tr>`,
    emailItemRowsHtml:
      overrides.emailItemRowsHtml ||
      `<tr><td style="padding:4px 0;font-size:13px;color:#14181F;">Burger × 1</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#14181F;">12.00</td></tr>`,
    appDeepLink: require("../api/openAppRedirect").buildConfirmationOpenUrl(
      overrides.confirmationNumber || "PC-2026-00000001",
    ),
    documentUrl: "",
    isCancellation: Boolean(overrides.isCancellation),
    cancelledConfirmationNumber: overrides.cancelledConfirmationNumber || "",
    ...overrides,
  };
}

function stepHtmlEmails() {
  console.log("\n== Step 2 HTML emails / documents ==");
  const {
    renderPaymentConfirmationHtml,
    renderPaymentConfirmationEmailHtml,
  } = require("../confirmation/htmlRenderer");
  const { DEFAULT_LOCALE } = require("../locales");
  const { computeHtmlHash } = require("../confirmation/helpers");

  assert(DEFAULT_LOCALE === "hr", "default locale is hr");

  const withoutVoucher = fixtureView();
  const withVoucher = fixtureView({
    voucher: {
      code: "PLS-TEST-CODE-0001",
      amount: 20,
    },
  });
  const cancellation = fixtureView({
    isCancellation: true,
    cancelledConfirmationNumber: "PC-2026-00000001",
    confirmationNumber: "PC-2026-00000002",
  });

  const emailNoVoucher = renderPaymentConfirmationEmailHtml(withoutVoucher);
  const emailVoucher = renderPaymentConfirmationEmailHtml(withVoucher);
  const emailEn = renderPaymentConfirmationEmailHtml({
    ...withoutVoucher,
    locale: "en",
  });
  const emailCancel = renderPaymentConfirmationEmailHtml(cancellation);
  const docNoVoucher = renderPaymentConfirmationHtml(withoutVoucher);
  const docVoucher = renderPaymentConfirmationHtml(withVoucher);
  const docCancel = renderPaymentConfirmationHtml(cancellation);
  const docWithBar = renderPaymentConfirmationHtml(withoutVoucher, {
    injectActions: true,
  });
  const docEn = renderPaymentConfirmationHtml({
    ...withoutVoucher,
    locale: "en",
  });

  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const written = {
    "email-without-voucher-hr.html": emailNoVoucher,
    "email-with-voucher-hr.html": emailVoucher,
    "email-without-voucher-en.html": emailEn,
    "email-cancellation-hr.html": emailCancel,
    "document-without-voucher-hr.html": docNoVoucher,
    "document-without-voucher-en.html": docEn,
    "document-with-voucher-hr.html": docVoucher,
    "document-cancellation-hr.html": docCancel,
  };
  for (const [name, html] of Object.entries(written)) {
    fs.writeFileSync(path.join(PREVIEW_DIR, name), html);
  }

  assert(emailNoVoucher.includes("Otvori u aplikaciji"), "HR email has CTA");
  assert(emailEn.includes("Open in the app"), "EN email has CTA");
  assert(
    emailEn.includes("This message is your payment confirmation"),
    "EN covering email is English",
  );
  assert(!emailEn.includes("Otvori u aplikaciji"), "EN email CTA is not Croatian");
  assert(!emailEn.includes("Potvrda o plaćanju"), "EN email is not Croatian");
  assert(docEn.includes("Payment confirmation"), "EN document title");
  assert(docEn.includes("Payment details"), "EN document section");
  assert(
    !docEn.includes("Potvrda o plaćanju ·") && !docEn.includes("Podaci o plaćanju ·"),
    "EN document has no bilingual headings",
  );
  assert(
    !docNoVoucher.includes("Payment details ·") &&
      !docNoVoucher.includes("Strane · Parties"),
    "HR document has no bilingual headings",
  );
  assert(
    emailNoVoucher.includes("app/open?id="),
    "CTA uses share-style open URL",
  );
  assert(
    !emailNoVoucher.includes("fiscal-documents/open"),
    "menu-order CTA is not a fiscal invoice URL",
  );
  assert(
    emailNoVoucher.includes("PC-2026-00000001"),
    "open URL includes confirmation number",
  );
  const {
    buildConfirmationOpenUrl,
    buildAppSchemeLink,
    renderOpenAppHtml,
  } = require("../api/openAppRedirect");
  const openUrl = buildConfirmationOpenUrl("PC-2026-00000001");
  assert(
    openUrl.includes("app/open?id=PC-2026-00000001"),
    "open URL matches global-referral share pattern",
  );
  assert(
    buildAppSchemeLink("PC-2026-00000001") === "com.pleis://wallet/PC-2026-00000001",
    "custom scheme matches share com.pleis:// style",
  );
  assert(
    renderOpenAppHtml("PC-2026-00000001").includes("com.pleis://wallet/PC-2026-00000001"),
    "open HTML tries installed app first",
  );
  assert(!emailNoVoucher.includes("u privitku"), "email does not claim attachment");
  assert(
    emailNoVoucher.includes("Ova poruka je tvoja potvrda"),
    "covering email is the confirmation",
  );
  assert(
    !emailNoVoucher.includes("PLS-TEST-CODE-0001"),
    "voucher stripped when absent",
  );
  assert(emailVoucher.includes("PLS-TEST-CODE-0001"), "voucher present when issued");
  assert(
    emailNoVoucher.includes("<table") && emailNoVoucher.includes("role=\"presentation\""),
    "email is table-based / inbox-previewable",
  );
  assert(
    docNoVoucher.includes("OVO NIJE FISKALIZIRANI RAČUN"),
    "document has statutory notice",
  );
  assert(
    !docNoVoucher.includes("pleis-doc-actions"),
    "stored document has no print bar",
  );
  assert(docWithBar.includes("pleis-doc-actions"), "optional print bar still works");
  assert(!emailNoVoucher.includes("pleis-doc-actions"), "email has no print bar");
  assert(emailCancel.includes("Storno potvrde"), "cancellation banner in email");
  assert(docCancel.includes("STORNIRANO"), "cancellation banner in document");
  assert(
    !emailNoVoucher.includes("Storno potvrde"),
    "cancellation stripped on normal email",
  );

  const h1 = computeHtmlHash(docNoVoucher);
  const h2 = computeHtmlHash(docNoVoucher);
  const h3 = computeHtmlHash(docVoucher);
  assert(h1 === h2, "HTML byte hash is stable");
  assert(h1 !== h3, "different HTML has different hash");
  assert(h1.length === 64, "hash is sha256 hex");
}

function stepSourceGates() {
  console.log("\n== Step 1/3/4 source gates ==");
  const docSrc = readSrc("backend/commonModules/fiscalDocuments/jobs/documentService.js");
  const ordering = extractFn(docSrc, "issueOrderingConfirmation");
  const reservation = extractFn(docSrc, "issueReservationConfirmation");
  const ticketing = extractFn(docSrc, "issueTicketingInvoices");
  const handle = extractFn(docSrc, "handleSuccessfulPayment");
  const menuFinalizer = readSrc(
    "backend/commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService.js",
  );
  const resFinalizer = readSrc(
    "backend/commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService.js",
  );
  const ticketFinalizer = readSrc(
    "backend/commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService.js",
  );
  const routes = readSrc(
    "backend/commonModules/paymentsIntegrations/monri/monriRoutes.js",
  );
  const cancelSrc = readSrc("backend/app/reservations/reservationService.js");
  const fulfillSrc = readSrc(
    "backend/commonModules/paymentsIntegrations/paymentsWebhook/services/paymentWebhookService.js",
  );

  assert(
    !ordering.includes("issueOrderingInvoices("),
    "ordering confirmation does not call Billko invoices",
  );
  assert(ordering.includes("getOrganizerParty"), "ordering uses party lookup without API key");
  assert(
    !reservation.includes("issueReservationInvoices("),
    "reservation confirmation does not call Billko invoices",
  );
  assert(ticketing.includes('kind: "service_fee"'), "ticketing still issues service fee");
  assert(ticketing.includes('kind: "tickets"'), "ticketing still issues tickets");
  assert(
    ticketing.includes('populate("user"') &&
      ticketing.includes("order.user?.firstName") &&
      !ticketing.includes("protectionUserDetails") &&
      !ticketing.includes("protectionNameFallback"),
    "ticketing invoice buyer uses logged-in user profile, not ticket attendee",
  );
  assert(handle.includes("subscription_invoice"), "worker handles subscription invoices");
  assert(
    !menuFinalizer.includes("Your order has been confirmed"),
    "no second menu confirmation email",
  );
  assert(
    !resFinalizer.includes("Your reservation is confirmed"),
    "no second reservation confirmation email",
  );
  assert(
    ticketFinalizer.includes("enqueueFiscalDocument"),
    "ticketing still enqueues fiscal docs",
  );
  assert(
    !ticketFinalizer.includes("application/pdf"),
    "ticketing QR email is unchanged (no invoice PDF on QR mail)",
  );
  const generator = readSrc(
    "backend/commonModules/fiscalDocuments/confirmation/generator.js",
  );
  assert(
    generator.includes("buildConfirmationOpenUrl"),
    "confirmation emails use share-style open URL",
  );
  const fiscalRoutes = readSrc(
    "backend/commonModules/fiscalDocuments/api/routes.js",
  );
  assert(
    fiscalRoutes.includes('router.get("/open"'),
    "legacy fiscal-documents/open still opens the app (already-sent emails)",
  );
  const appRoutes = readSrc("backend/routes/appRoutes.js");
  assert(
    appRoutes.includes('router.get("/open"'),
    "open-app route is mounted at /app/open",
  );
  const emailConfirmation = extractFn(generator, "emailConfirmation");
  assert(
    !emailConfirmation.includes("attachments"),
    "ordering/reservation covering email has no file attachments",
  );
  assert(
    !emailConfirmation.includes("attachments") &&
      !emailConfirmation.includes("application/pdf"),
    "potvrda email does not attach a PDF",
  );
  const invoiceCtl = readSrc(
    "backend/commonModules/fiscalDocuments/api/controller.js",
  );
  assert(
    invoiceCtl.includes("application/pdf") && invoiceCtl.includes("fetchInvoicePdf"),
    "fiscal invoice download serves Billko PDF",
  );
  assert(
    invoiceCtl.includes('populate("user", "language")') &&
      invoiceCtl.includes("fetchInvoicePdf(invoice, { locale })"),
    "invoice download uses customer language",
  );
  assert(
    ticketing.includes("maybeEmailTicketingInvoicePdfs"),
    "ticketing invoices email PDF after fiscalize",
  );
  assert(routes.includes('"/refund"'), "refund route is mounted");
  assert(
    !cancelSrc.includes("paymentStatus = \"refunded\""),
    "cancelReservation does not mark refunded without Monri",
  );
  assert(
    fulfillSrc.includes("orderType === \"subscription\""),
    "subscription fulfill is wired",
  );
  assert(
    !ordering.includes("getOrganizerSeller"),
    "ordering confirmation does not require Billko seller key",
  );
}

function stepRefundAndFields() {
  console.log("\n== Step 3/5 refund + fields ==");
  const {
    nextRefundStatus,
    planMonriRefund,
    isLiveRefundEnabled,
  } = require("../../paymentsIntegrations/monri/refundService");
  const {
    mapOrderItems,
    snapshotCardFromMonriPayload,
    humanPaymentMethod,
  } = require("../confirmation/helpers");
  const { canViewInvoice, canViewConfirmation } = require("../api/access");
  const {
    buildSubscriptionInvoicePayload,
  } = require("../invoice/subscriptionBuilder");
  const { InvoiceType } = require("../../paymentsIntegrations/billko/billkoInvoiceBuilder");
  const { buildLedgerEntryInput } = require("../../paymentsIntegrations/ledger/ledgerWriter");
  const { applyLedgerListFilters } = require("../../paymentsIntegrations/ledger/ledgerFilters");

  assert(isLiveRefundEnabled() === false, "live Monri refunds are disabled by default");
  assert(
    nextRefundStatus({ originalAmount: 10, alreadyRefunded: 0, thisRefundAmount: 4 }) ===
      "paid",
    "partial refund keeps paid status",
  );
  assert(
    nextRefundStatus({ originalAmount: 10, alreadyRefunded: 6, thisRefundAmount: 4 }) ===
      "refunded",
    "full refund marks refunded",
  );
  const planned = planMonriRefund({
    tx: { monriTransactionId: "m1", amount: 10, refundedAmount: 0 },
    amount: 4,
  });
  assert(planned.ok && planned.nextStatus === "paid", "planMonriRefund partial");
  assert(
    planMonriRefund({ tx: { amount: 10 }, amount: 1 }).error ===
      "transaction_not_refundable",
    "missing monri id is not refundable",
  );

  const rows = mapOrderItems(
    {
      items: [
        {
          quantity: 1,
          unitFinalPrice: 8,
          finalPrice: 8,
          menuItemSnapShot: { title: "Soup", taxPercent: 13 },
        },
      ],
      combos: [
        {
          quantity: 1,
          unitFinalPrice: 15,
          finalPrice: 15,
          comboSnapShot: { name: "Lunch combo", taxPercent: 25 },
          items: [
            { quantity: 1, menuItemSnapShot: { title: "Fries", taxPercent: 25 } },
          ],
        },
      ],
      priceBreakdown: { tip: 2 },
    },
    "hr",
  );
  assert(
    rows.some((row) => row.name === "Lunch combo" && row.amount === 15),
    "combo is a confirmation line",
  );
  assert(
    rows.some((row) => row.name === "Fries" && row.isOption),
    "combo components are option lines",
  );
  assert(rows.some((row) => row.name === "Napojnica"), "tip line present");

  const card = snapshotCardFromMonriPayload({
    masked_pan: "411111******4242",
    cc_type: "visa",
  });
  assert(card.cardLast4 === "4242", "last4 from masked PAN");
  assert(card.cardBrand === "Visa", "brand snapshot");
  const fullPan = snapshotCardFromMonriPayload({ pan: "4111111111114242" });
  assert(fullPan.cardLast4 === "4242", "full PAN is reduced to last4");
  assert(
    humanPaymentMethod("card", "hr", { cardBrand: "Visa", cardLast4: "4242" }) ===
      "Kartica, Visa 4242",
    "human payment method includes brand/last4",
  );

  const admin = { userType: "admin", _id: "a" };
  const organizer = { userType: "organizer", _id: "org1" };
  assert(
    canViewInvoice(admin, { kind: "service_fee", companyOrganizer: "org1" }),
    "admin can view service fee",
  );
  assert(
    !canViewInvoice(organizer, { kind: "service_fee", companyOrganizer: "org1" }),
    "organizer cannot view service fee",
  );
  assert(
    canViewConfirmation(organizer, { organizerCompanyId: "org1" }),
    "organizer can view own confirmation",
  );
  assert(
    !canViewConfirmation(organizer, { organizerCompanyId: "other" }),
    "organizer cannot view others' confirmation",
  );

  const payload = buildSubscriptionInvoicePayload({
    transaction: {
      orderNumber: "sub-dummy-1",
      amount: 99,
      paymentMethod: "card",
      subscriptionTypes: ["ordering", "reservations"],
    },
    user: {
      email: "pleis-dummy-org@example.invalid",
      firstName: "Org",
      lastName: "Dummy",
      companyDetails: { name: "Dummy Org d.o.o.", oib: "11111111111" },
    },
    organization: { basicInfo: { name: "Dummy Org" } },
  });
  assert(payload.type === InvoiceType.Electronic, "subscription eRačun is type 2");
  assert(payload.createOrUpdateOrganizationCustomer === true, "creates org customer");
  assert(
    payload.products[0].taxRateLabels[0] === "Tg4",
    "subscription uses documented Tg4",
  );

  const ledger = buildLedgerEntryInput({
    orderId: "000000000000000000000001",
    orderType: "menuorders",
    module: "ORDERING",
    amount: 12.5,
    paymentStatus: "paid",
  });
  assert(ledger.schemaVersion === 5 && ledger.amountCents === 1250, "ledger v5 writer");
  const filtered = applyLedgerListFilters({}, { cardLast4: "4242", module: "ORDERING" });
  assert(filtered.cardLast4 === "4242", "additive ledger filters");
}

async function stepFiscalInvoicePdf() {
  console.log("\n== Fiscal invoice PDF (Billko račun only) ==");
  const {
    buildInvoicePdfAttachment,
    looksLikePdf,
    localeForInvoice,
  } = require("../invoice/pdf");
  const { renderFiscalInvoiceHtml } = require("../invoice/htmlRenderer");

  const html = renderFiscalInvoiceHtml(
    {
      invoiceNumber: "14/SUBMERCHANTDEMO/1",
      fiscalizationNumber: "JIR-TEST",
      orderNumber: "6aa7a4a1441346c43cfe1270",
      amount: 20,
      currency: "EUR",
      createdAt: new Date("2026-09-14T07:52:24Z"),
      rawResponse: {
        products: [
          {
            name: "General",
            quantity: 1,
            unitRetailPrice: 20,
            taxRateLabels: ["Tg1"],
          },
        ],
        billingInformation: {
          firstName: "Ali",
          lastName: "Imran",
          emailAddress: "pleis-dummy@example.invalid",
        },
        payment: [{ paymentType: 2, amount: 20 }],
      },
    },
    {
      sellerLegalName: "Dummy Organizer d.o.o.",
      sellerAddress: "Ilica 1, Zagreb",
      sellerOib: "12345678901",
    },
  );
  assert(html.includes("Račun"), "fiscal template is a račun");
  assert(html.includes("Podaci o računu"), "HR PDF uses Croatian labels");
  assert(!html.includes("Invoice details"), "HR PDF is Croatian-only labels");
  assert(html.includes("Kartica"), "HR PDF payment method is Kartica");
  assert(!html.includes("OVO NIJE FISKALIZIRANI RAČUN"), "fiscal PDF is not a potvrda");
  assert(html.includes("14/SUBMERCHANTDEMO/1"), "invoice number is in HTML");
  assert(html.includes("General"), "Billko line items are in HTML");
  assert(html.includes("Ali Imran"), "HR PDF buyer is the logged-in user name");
  assert(!html.includes("Guest User"), "HR PDF buyer is not Guest User");
  assert(!html.includes("Suheer Zahid"), "HR PDF buyer is not ticket attendee");
  assert(html.includes("{{DOC_TITLE}}") === false, "invoice tokens are filled");

  const htmlEn = renderFiscalInvoiceHtml(
    {
      invoiceNumber: "3/MERCHANTDEMO/1",
      fiscalizationNumber: "JIR-TEST",
      orderNumber: "6aa7a4a1441346c43cfe1270",
      amount: 1.2,
      currency: "EUR",
      createdAt: new Date("2026-09-14T07:52:24Z"),
      rawResponse: {
        products: [
          {
            name: "Service fee — General",
            quantity: 1,
            unitRetailPrice: 1.2,
            taxRateLabels: ["Tg4"],
          },
        ],
        billingInformation: {
          firstName: "Ali",
          lastName: "Imran",
          emailAddress: "pleis-dummy@example.invalid",
        },
        payment: [{ paymentType: 2, amount: 1.2 }],
      },
    },
    {
      locale: "en",
      sellerLegalName: "Dummy Organizer d.o.o.",
      sellerAddress: "Ilica 1, Zagreb",
      sellerOib: "12345678901",
    },
  );
  assert(htmlEn.includes('lang="en"'), "EN PDF html lang");
  assert(htmlEn.includes(">Invoice<"), "EN PDF primary title is Invoice");
  assert(htmlEn.includes("Invoice details"), "EN PDF section labels");
  assert(!htmlEn.includes("Račun"), "EN PDF has no Croatian title");
  assert(!htmlEn.includes("Podaci o računu"), "EN PDF has no Croatian details");
  assert(htmlEn.includes("This document has been fiscalized"), "EN PDF footer");
  assert(htmlEn.includes(">Card<"), "EN PDF payment method is Card");
  assert(htmlEn.includes("Ali Imran"), "EN PDF buyer is the logged-in user name");
  assert(!htmlEn.includes("Guest User"), "EN PDF buyer is not Guest User");
  assert(!htmlEn.includes("Suheer Zahid"), "EN PDF buyer is not ticket attendee");
  assert(!htmlEn.includes("Kartica"), "EN PDF is not Croatian payment method");
  assert(!htmlEn.includes("Dokument je fiskaliziran"), "EN PDF is not Croatian footer");
  assert(!htmlEn.includes("{{DOC_TITLE}}"), "EN invoice tokens are filled");

  const { customerFromBilling } = require("../invoice/htmlRenderer");
  const { buildBillingInformation } = require("../../paymentsIntegrations/billko/billkoInvoiceBuilder");
  const billed = buildBillingInformation(
    {},
    { firstName: "Ali", lastName: "Imran" },
  );
  assert(billed.firstName === "Ali" && billed.lastName === "Imran", "billing fallback uses user profile name");
  const missing = buildBillingInformation({});
  assert(
    `${missing.firstName} ${missing.lastName}`.trim() !== "Guest User",
    "missing billing names are not Guest User",
  );
  assert(
    customerFromBilling({ firstName: "Guest", lastName: "User" }, "en").name !== "Guest User",
    "PDF renderer does not print Guest User",
  );
  assert(
    customerFromBilling({ firstName: "Ali", lastName: "Imran" }, "en").name === "Ali Imran",
    "PDF renderer prints the real buyer name",
  );

  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, "fiscal-invoice-hr.html"), html);
  fs.writeFileSync(path.join(PREVIEW_DIR, "fiscal-invoice-en.html"), htmlEn);

  const template = require("fs").readFileSync(
    require("path").join(__dirname, "../templates/invoice.html"),
    "utf8",
  );
  assert(
    template.includes("{{DOC_TITLE}}") &&
      template.includes("{{SECTION_DETAILS}}") &&
      template.includes("{{HTML_LANG}}") &&
      template.includes("{{PAYMENT_METHOD}}") &&
      template.includes("{{FOOTER_LINE}}"),
    "fiscal invoice template uses i18n tokens",
  );
  assert(
    !template.includes(">Račun<") && !template.includes("Podaci o računu"),
    "fiscal invoice template is not hardcoded Croatian",
  );

  const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const attachment = buildInvoicePdfAttachment({
    buffer: pdfBytes,
    fileName: "14_SUBMERCHANTDEMO_1.pdf",
    invoiceNumber: "14/SUBMERCHANTDEMO/1",
  });
  assert(looksLikePdf(pdfBytes), "local PDF magic bytes");
  assert(attachment.filename.endsWith(".pdf"), "Mailgun attachment filename ends with .pdf");
  assert(attachment.contentType === "application/pdf", "Mailgun content-type is application/pdf");

  const emailSrc = require("fs").readFileSync(
    require("path").join(__dirname, "../invoice/pdf.js"),
    "utf8",
  );
  assert(
    emailSrc.includes("generateInvoicePdf") &&
      emailSrc.includes("renderFiscalInvoiceHtml") &&
      emailSrc.includes("maybeEmailTicketingInvoicePdfs") &&
      emailSrc.includes("invoiceEmailSubject"),
    "ticketing invoice email path generates PDF from HTML template",
  );
  const { getCopy } = require("../locales");
  assert(
    getCopy("en").invoiceEmailSubject("3/MERCHANTDEMO/1, 16/SUBMERCHANTDEMO/1") ===
      "Invoices for your purchase (3/MERCHANTDEMO/1, 16/SUBMERCHANTDEMO/1)",
    "EN invoice email subject",
  );
  assert(
    getCopy("en").invoiceEmailBody.includes("attached"),
    "EN invoice email body",
  );
  assert(
    getCopy("hr").invoiceEmailSubject("2/MERCHANTDEMO/1") === "Račun 2/MERCHANTDEMO/1",
    "HR invoice email subject",
  );
  assert(
    getCopy("en").invoiceEmailSubject("3/MERCHANTDEMO/1, 16/SUBMERCHANTDEMO/1") !==
      "Invoice 3/MERCHANTDEMO/1, 16/SUBMERCHANTDEMO/1",
    "EN subject is not the old Invoice ${numbers} format",
  );

  const fetchFn = extractFn(emailSrc, "fetchInvoicePdf");
  const storeFn = extractFn(emailSrc, "storeInvoicePdfIfAvailable");
  const emailFn = extractFn(emailSrc, "maybeEmailTicketingInvoicePdfs");
  assert(
    emailSrc.includes('require("../../../models/UserModel")'),
    "invoice PDF locale loads User via UserModel",
  );
  assert(
    emailSrc.includes("generateInvoicePdf(row, { locale })"),
    "email generates PDF in the customer locale",
  );
  assert(
    !emailFn.includes("fetchInvoicePdf("),
    "email does not attach Azure-cached PDF via fetchInvoicePdf",
  );
  assert(
    fetchFn.includes("generateInvoicePdf") && !fetchFn.includes("pdfFileUrl"),
    "admin download regenerates PDF instead of using Azure HR cache",
  );
  assert(
    storeFn.includes("pdfStorageKey") && storeFn.includes("pdfFileUrl"),
    "store skips overwriting an existing Azure cache",
  );
  assert(
    storeFn.includes("__pdfBuffer"),
    "store reuses a just-generated buffer instead of regenerating HR",
  );

  assert(
    (await localeForInvoice({ user: { language: "en" } })) === "en",
    "localeForInvoice uses populated user.language",
  );
  assert(
    (await localeForInvoice({ user: { language: "hr" } })) === "hr",
    "localeForInvoice populated HR",
  );
  assert((await localeForInvoice({}, "en")) === "en", "localeForInvoice fallback");
  assert((await localeForInvoice({})) === "hr", "localeForInvoice defaults to hr");
}

function stepPendingNoNumber() {
  console.log("\n== Failed/pending does not allocate PC ==");
  const docSrc = readSrc("backend/commonModules/fiscalDocuments/jobs/documentService.js");
  const ordering = extractFn(docSrc, "issueOrderingConfirmation");
  const reservation = extractFn(docSrc, "issueReservationConfirmation");
  assert(
    ordering.includes('paymentStatus !== "paid"') && ordering.includes("return null"),
    "unpaid menu order skips confirmation",
  );
  assert(
    reservation.includes('paymentStatus !== "paid"') && reservation.includes("return null"),
    "unpaid reservation skips confirmation",
  );
  const generator = readSrc(
    "backend/commonModules/fiscalDocuments/confirmation/generator.js",
  );
  assert(
    generator.includes("allocateConfirmationNumber") &&
      generator.includes("issuePaymentConfirmation"),
    "PC numbers are allocated only when issuing",
  );
}

async function main() {
  console.log(`\nPayment redesign verification pass ${PASS_LABEL}`);
  console.log("No Mongo / Monri / Billko HTTP in this script.\n");
  stepHtmlEmails();
  stepSourceGates();
  stepRefundAndFields();
  await stepFiscalInvoicePdf();
  stepPendingNoNumber();
  console.log(`\nALL CHECKS PASSED (pass ${PASS_LABEL})`);
  console.log(`Previews: ${PREVIEW_DIR}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
