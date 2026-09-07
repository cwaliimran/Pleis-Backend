/**
 * All Monri payment settings come from .env (dev / prod / Azure).
 * No host, key, currency, or callback URL is hardcoded.
 */
function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required in environment (dev/prod Azure App Settings)`);
  }
  return value;
}

function getMonriBaseUrl() {
  return requiredEnv("MONRI_BASE_URL").replace(/\/$/, "");
}

function getMonriKey() {
  return requiredEnv("MONRI_KEY");
}

function getMonriAuthToken() {
  return requiredEnv("MONRI_AUTH_TOKEN");
}

function getMonriSuccessUrl() {
  return requiredEnv("SUCCESS_URL");
}

function getMonriCancelUrl() {
  return requiredEnv("CANCEL_URL");
}

function getMonriCurrency() {
  return requiredEnv("MONRI_CURRENCY");
}

function getMonriLanguage() {
  return requiredEnv("MONRI_LANGUAGE");
}

function getMonriCountry() {
  return requiredEnv("MONRI_COUNTRY");
}

function getMonriLocale() {
  return requiredEnv("MONRI_LOCALE");
}

/** Monri Components.js environment: "test" or "prod" */
function getMonriComponentsEnv() {
  const value = requiredEnv("MONRI_COMPONENTS_ENV").toLowerCase();
  if (value !== "test" && value !== "prod") {
    throw new Error("MONRI_COMPONENTS_ENV must be test or prod");
  }
  return value;
}

function getMonriWebhookSecret() {
  return requiredEnv("MONRI_WEBHOOK_SECRET");
}

module.exports = {
  getMonriBaseUrl,
  getMonriKey,
  getMonriAuthToken,
  getMonriSuccessUrl,
  getMonriCancelUrl,
  getMonriCurrency,
  getMonriLanguage,
  getMonriCountry,
  getMonriLocale,
  getMonriComponentsEnv,
  getMonriWebhookSecret,
};
