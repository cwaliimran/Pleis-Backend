const { sendResponse } = require("../../helperUtils/responseUtil");
const { containsBlockedLanguage } = require("./blockedTerms");

/** Set false to re-enable moderation after testing. */
const TEXT_MODERATION_ENABLED = false;

/**
 * Routes where free-text moderation runs (end-user / public-facing writes).
 * Admin & organizer CMS (menu, loyalty, reservations, challenges, etc.) is
 * trusted staff content and is not scanned here.
 */
const MODERATED_PREFIXES = ["/api/v1/app"];

const MODERATED_PATHS = [
  "/api/v1/auth/register",
  "/api/v1/auth/social-auth",
  "/api/v1/contact-us",
];

const EXCLUDED_ROUTES = [
  "/api/v1/app/payments/cards",
  "/api/v1/webhooks",
];

function shouldModerateRequest(req) {
  const path = req.originalUrl.split("?")[0];

  if (EXCLUDED_ROUTES.some((route) => path.startsWith(route))) {
    return false;
  }

  if (path.startsWith("/api/v1/admin") || path.startsWith("/api/v1/organizer")) {
    return false;
  }

  if (MODERATED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  return MODERATED_PATHS.some((route) => path.startsWith(route));
}

/**
 * Extract string values recursively
 */
function extractStrings(obj, results = []) {
  if (!obj) return results;

  if (typeof obj === "string") {
    results.push(obj);
    return results;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractStrings(item, results);
    }
    return results;
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    for (const key of Object.keys(obj)) {
      extractStrings(obj[key], results);
    }
  }

  return results;
}

function textModerationMiddleware(req, res, next) {
  if (!TEXT_MODERATION_ENABLED || !shouldModerateRequest(req)) {
    return next();
  }

  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }

  if (!req.body || typeof req.body !== "object") {
    return next();
  }

  const strings = extractStrings(req.body);

  for (const text of strings) {
    if (typeof text !== "string") continue;

    if (containsBlockedLanguage(text)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "inappropriate_language_detected",
      });
    }
  }

  next();
}

/** @deprecated No async setup required; kept for server bootstrap compatibility */
async function initTextModeration() {}

module.exports = {
  textModerationMiddleware,
  initTextModeration,
  shouldModerateRequest,
};
