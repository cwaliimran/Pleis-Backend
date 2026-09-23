// ORIGINAL flat ticketing service fee (restore if needed):
// const TAX_RATE_BOOKING = 0.06;

/**
 * Ticketing service fee — DOC / Core / Payout §4.2:
 *   fee = min(base, 30 EUR) + 8% of item
 * Worked example: ticket 30.00 EUR → 3.00 + 2.40 = 5.40 EUR (540 cents).
 * Compute in integer cents; never use floats for the final amount.
 */
const SERVICE_FEE_BASE_CENTS = 300; // 3.00 EUR
const SERVICE_FEE_BASE_CAP_CENTS = 3000; // 30.00 EUR
const SERVICE_FEE_RATE = 0.08;

/**
 * Reservation min-spend voucher: no Pleis tax/service fee on the prepaid voucher.
 * Tax applies later on menu items when the voucher is spent (organizer fiscalizes those).
 * Kept at 0 — do not reintroduce a reservation tax line on payment confirmations.
 */
const TAX_RATE_RESERVATION = 0;

/**
 * When true, reservations that require payment are marked paid immediately on create
 * (no Monri / gateway). For frontend testing while Monri is unavailable.
 * Set to false before production or when Monri is live again.
 */
const BYPASS_RESERVATION_PAYMENT = false;

/**
 * App-level defaults for public brand URLs / emails / deep links.
 * Prefer process.env.* when set; these are fallbacks so call sites never re-hardcode.
 */
const PLEIS_WEB = "https://pleis.hr";
const PLEIS_SUPPORT_EMAIL = "support@pleis.hr";
const PLEIS_MAIL_DOMAIN = "pleis.ai";
const PLEIS_APP_SCHEME = "com.pleis";
const PLEIS_IOS_STORE_URL =
  "https://apps.apple.com/app/pleisapp/id1234567890";
const PLEIS_ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.pleis";
const MAILGUN_API_BASE = "https://api.mailgun.net";
const FIREBASE_DATABASE_URL = "https://pleis-4fb7b.firebaseio.com";

/** Stable CORS allowlist brand origins (machine/LAN IPs belong in EXTRA_CORS_ORIGINS). */
const CORS_BRAND_ORIGINS = [
  "https://pleis.com",
  "https://www.pleis.com",
  "https://dev.pleis.com",
  "https://www.dev.pleis.com",
  "http://localhost:4003",
  "https://pleis.vercel.app",
];

/** Default allowlist for createAdmin when ADMIN_SIGNUP_ALLOWED_IPS is unset. */
const ADMIN_SIGNUP_ALLOWED_IPS = ["127.0.0.1", "::1"];

function envOr(key, fallback) {
  const v = process.env[key];
  if (v == null) return fallback;
  const trimmed = String(v).trim();
  return trimmed === "" ? fallback : trimmed;
}

function resolvePleisWeb() {
  return envOr("PLEIS_WEB", PLEIS_WEB);
}

function resolvePleisSupportEmail() {
  return envOr("PLEIS_SUPPORT_EMAIL", PLEIS_SUPPORT_EMAIL);
}

function resolvePleisMailDomain() {
  return envOr("MAILGUN_DOMAIN", PLEIS_MAIL_DOMAIN);
}

function resolvePleisAppScheme() {
  return envOr("PLEIS_APP_SCHEME", PLEIS_APP_SCHEME);
}

function resolvePleisIosStoreUrl() {
  return envOr("PLEIS_IOS_STORE_URL", PLEIS_IOS_STORE_URL);
}

function resolvePleisAndroidStoreUrl() {
  return envOr("PLEIS_ANDROID_STORE_URL", PLEIS_ANDROID_STORE_URL);
}

function resolveMailgunApiBase() {
  return envOr("MAILGUN_BASE_URL", MAILGUN_API_BASE);
}

function resolveFirebaseDatabaseUrl() {
  return envOr("FIREBASE_DATABASE_URL", FIREBASE_DATABASE_URL);
}

/** Default Mailgun From header: Pleis <noreply@{MAILGUN_DOMAIN}> */
function resolveMailFrom() {
  return envOr(
    "MAIL_FROM",
    `Pleis <noreply@${resolvePleisMailDomain()}>`,
  );
}

function resolveAdminSignupAllowedIps() {
  const raw = process.env.ADMIN_SIGNUP_ALLOWED_IPS;
  if (raw == null || String(raw).trim() === "") {
    return [...ADMIN_SIGNUP_ALLOWED_IPS];
  }
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeTicketingServiceFeeCents(itemPriceCents) {
  const price = Math.max(0, Math.round(Number(itemPriceCents) || 0));
  if (price <= 0) return 0;
  const base = Math.min(SERVICE_FEE_BASE_CENTS, SERVICE_FEE_BASE_CAP_CENTS);
  const percent = Math.round(price * SERVICE_FEE_RATE);
  return base + percent;
}

function computeTicketingServiceFeeEur(itemPriceEur) {
  const cents = Math.round(Number(itemPriceEur || 0) * 100);
  return computeTicketingServiceFeeCents(cents) / 100;
}

module.exports = {
  // TAX_RATE_BOOKING, // ORIGINAL 6% — commented; use SERVICE_FEE_* + computeTicketingServiceFee*
  SERVICE_FEE_BASE_CENTS,
  SERVICE_FEE_BASE_CAP_CENTS,
  SERVICE_FEE_RATE,
  computeTicketingServiceFeeCents,
  computeTicketingServiceFeeEur,
  TAX_RATE_RESERVATION,
  BYPASS_RESERVATION_PAYMENT,

  PLEIS_WEB,
  PLEIS_SUPPORT_EMAIL,
  PLEIS_MAIL_DOMAIN,
  PLEIS_APP_SCHEME,
  PLEIS_IOS_STORE_URL,
  PLEIS_ANDROID_STORE_URL,
  MAILGUN_API_BASE,
  FIREBASE_DATABASE_URL,
  CORS_BRAND_ORIGINS,
  ADMIN_SIGNUP_ALLOWED_IPS,

  resolvePleisWeb,
  resolvePleisSupportEmail,
  resolvePleisMailDomain,
  resolvePleisAppScheme,
  resolvePleisIosStoreUrl,
  resolvePleisAndroidStoreUrl,
  resolveMailgunApiBase,
  resolveFirebaseDatabaseUrl,
  resolveMailFrom,
  resolveAdminSignupAllowedIps,
};
