const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = new Set(["en", "hr"]);

function resolveLocale(value) {
  const raw = String(value || DEFAULT_LOCALE)
    .trim()
    .toLowerCase()
    .replace("_", "-");
  const code = raw.split("-")[0];
  return SUPPORTED_LOCALES.has(code) ? code : DEFAULT_LOCALE;
}

const COPY = {
  en: {
    card: "Card",
    cash: "Cash",
    tip: "Tip",
    item: "Item",
    reservation: "Reservation",
    minSpendPrepayment: "Minimum-spend prepayment (multi-use voucher)",
    print: "Print",
    download: "Download",
    subjectWithVoucher: (venue) => `Payment confirmation and voucher, ${venue}`,
    subjectWithoutVoucher: (venue, currency, amount) =>
      `Payment confirmation, ${venue}, ${currency} ${amount}`,
  },
  hr: {
    card: "Kartica",
    cash: "Gotovina",
    tip: "Napojnica",
    item: "Stavka",
    reservation: "Rezervacija",
    minSpendPrepayment: "Predujam za minimalnu potrošnju (višenamjenski vaučer)",
    print: "Ispiši",
    download: "Preuzmi",
    subjectWithVoucher: (venue) => `Potvrda o plaćanju i vaučer, ${venue}`,
    subjectWithoutVoucher: (venue, currency, amount) =>
      `Potvrda o plaćanju, ${venue}, ${currency} ${amount}`,
  },
};

function getCopy(locale) {
  return COPY[resolveLocale(locale)];
}

function humanPaymentMethod(method, locale) {
  const copy = getCopy(locale);
  const raw = String(method || "").trim();
  if (raw === "applePay" || raw === "Apple Pay") return "Apple Pay";
  if (raw === "googlePay" || raw === "Google Pay") return "Google Pay";
  if (raw === "cash" || raw === "Gotovina" || raw === "Cash") return copy.cash;
  return copy.card;
}

function applyReplacements(html, pairs) {
  let result = html;
  for (const [from, to] of pairs) {
    result = result.split(from).join(to);
  }
  return result;
}

// Original PDF template is HR-primary with English as the secondary line.
// EN swaps that order. Statutory phrase stays Croatian (art. 30).
const DOCUMENT_EN_PAIRS = [
  ['lang="hr"', 'lang="en"'],
  [
    "{{CONFIRMATION_NUMBER}} Potvrda o plaćanju",
    "{{CONFIRMATION_NUMBER}} Payment confirmation",
  ],
  [
    'content: "Potvrda o plaćanju {{CONFIRMATION_NUMBER}} · stranica "',
    'content: "Payment confirmation {{CONFIRMATION_NUMBER}} · page "',
  ],
  [
    '<div class="hr">Potvrda o plaćanju</div>\n      <div class="en">Payment confirmation</div>',
    '<div class="hr">Payment confirmation</div>\n      <div class="en">Potvrda o plaćanju</div>',
  ],
  ["Podaci o plaćanju · Payment details", "Payment details · Podaci o plaćanju"],
  ["Kupac<small>Customer</small>", "Customer<small>Kupac</small>"],
  [
    "Identifikator transakcije<small>Transaction ID</small>",
    "Transaction ID<small>Identifikator transakcije</small>",
  ],
  [
    "Referenca narudžbe / događaja<small>Order / event reference</small>",
    "Order / event reference<small>Referenca narudžbe / događaja</small>",
  ],
  [
    "Datum i vrijeme plaćanja<small>Date and time of payment</small>",
    "Date and time of payment<small>Datum i vrijeme plaćanja</small>",
  ],
  [
    "Način plaćanja<small>Payment method</small>",
    "Payment method<small>Način plaćanja</small>",
  ],
  ["Iznos<small>Amount</small>", "Amount<small>Iznos</small>"],
  ["Strane · Parties", "Parties · Strane"],
  [
    "Pružatelj usluge · Service provider",
    "Service provider · Pružatelj usluge",
  ],
  [
    "Naplatu obavio · Payment collected by",
    "Payment collected by · Naplatu obavio",
  ],
  ["Stavke · Paid items", "Paid items · Stavke"],
  ['<th class="l">Stavka · Item</th>', '<th class="l">Item · Stavka</th>'],
  ["<th>PDV %</th>", "<th>VAT %</th>"],
  ["<th>Kol.</th>", "<th>Qty</th>"],
  ["<th>Jed. cijena</th>", "<th>Unit price</th>"],
  ["<th>Iznos</th>", "<th>Amount</th>"],
  [
    "Ukupno plaćeno · Total paid ({{CURRENCY}})",
    "Total paid · Ukupno plaćeno ({{CURRENCY}})",
  ],
  [
    "Vaučer za minimalnu potrošnju · Minimum-spend voucher",
    "Minimum-spend voucher · Vaučer za minimalnu potrošnju",
  ],
  [
    "Broj vaučera · Voucher code",
    "Voucher code · Broj vaučera",
  ],
  ["Vrijednost · Value", "Value · Vrijednost"],
  ["Vrijedi · Valid:", "Valid · Vrijedi:"],
  [
    "Mjesto korištenja · Redeemable at:",
    "Redeemable at · Mjesto korištenja:",
  ],
  [
    "Iznos se automatski oduzima od narudžbi u aplikaciji, ili ga osoblje aktivira unosom koda.",
    "The amount is deducted automatically from in-app orders, or staff redeem it by entering the code.",
  ],
  ["Izdavatelj potvrde · Issued by", "Issued by · Izdavatelj potvrde"],
  [
    "Dokument je izdan elektronički i valjan je bez potpisa i pečata. Izdan {{ISSUED_AT}}.\n      Kontrolni zapis: {{DOCUMENT_HASH}} · Upiti: {{SUPPORT_EMAIL}}",
    "This document was issued electronically and is valid without a signature or stamp. Issued {{ISSUED_AT}}.\n      Control record: {{DOCUMENT_HASH}} · Enquiries: {{SUPPORT_EMAIL}}",
  ],
];

const EMAIL_EN_PAIRS = [
  ['lang="hr"', 'lang="en"'],
  [
    "Potvrda o plaćanju {{CONFIRMATION_NUMBER}}",
    "Payment confirmation {{CONFIRMATION_NUMBER}}",
  ],
  [
    "Uplata od {{CURRENCY}} {{TOTAL_AMOUNT}} je zaprimljena. Potvrda {{CONFIRMATION_NUMBER}} u privitku.",
    "A payment of {{CURRENCY}} {{TOTAL_AMOUNT}} has been received. Confirmation {{CONFIRMATION_NUMBER}} is attached.",
  ],
  [
    "text-transform:uppercase;font-weight:700;\">Potvrda o plaćanju</td>",
    "text-transform:uppercase;font-weight:700;\">Payment confirmation</td>",
  ],
  [
    "Uplata je zaprimljena,<br>{{CUSTOMER_FIRST_NAME}}.",
    "Payment received,<br>{{CUSTOMER_FIRST_NAME}}.",
  ],
  [
    "{{ORGANIZER_VENUE_NAME}} te očekuje.",
    "{{ORGANIZER_VENUE_NAME}} is expecting you.",
  ],
  ["Ukupno plaćeno", "Total paid"],
  ["Broj potvrde", "Confirmation number"],
  ["Referenca narudžbe", "Order reference"],
  ["Identifikator transakcije", "Transaction ID"],
  ["Pružatelj usluge", "Service provider"],
  [">Stavke<", ">Items<"],
  ["Vaučer za minimalnu potrošnju", "Minimum-spend voucher"],
  [
    "Vrijednost {{CURRENCY}} {{VOUCHER_AMOUNT}} · vrijedi {{VOUCHER_VALID_FROM}} – {{VOUCHER_VALID_TO}}",
    "Value {{CURRENCY}} {{VOUCHER_AMOUNT}} · valid {{VOUCHER_VALID_FROM}} – {{VOUCHER_VALID_TO}}",
  ],
  [
    "Iznos se automatski oduzima od narudžbi u aplikaciji, ili ga osoblje može aktivirati unosom koda.",
    "The amount is deducted automatically from in-app orders, or staff can redeem it by entering the code.",
  ],
  ["Otvori u aplikaciji", "Open in the app"],
  [
    "Potvrda o plaćanju je u privitku, a uvijek je dostupna i u aplikaciji pod\n              <strong>Novčanik → Povijest transakcija</strong>.<br><br>\n              Trebaš pomoć? Piši nam na",
    "The payment confirmation is attached, and is always available in the app under\n              <strong>Wallet → Transaction history</strong>.<br><br>\n              Need help? Write to us at",
  ],
];

function localizeDocumentTemplate(html, locale) {
  if (resolveLocale(locale) !== "en") return html;
  return applyReplacements(html, DOCUMENT_EN_PAIRS);
}

function localizeEmailTemplate(html, locale) {
  if (resolveLocale(locale) !== "en") return html;
  return applyReplacements(html, EMAIL_EN_PAIRS);
}

module.exports = {
  DEFAULT_LOCALE,
  resolveLocale,
  getCopy,
  humanPaymentMethod,
  localizeDocumentTemplate,
  localizeEmailTemplate,
};
