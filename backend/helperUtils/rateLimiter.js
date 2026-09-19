// utils/rateLimiter.js
const rateLimit = require("express-rate-limit");
const { sendResponse } = require("../helperUtils/responseUtil");
const { createRateLimitStore } = require("./rateLimitStore");
const { isDev } = require("../config/origins");

/**
 * Normalize IPv6 so the same client doesn't get multiple buckets
 * (express-rate-limit's ipKeyGenerator is not in v7.4).
 */
function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return "unknown";
  // Strip IPv4-mapped IPv6 prefix
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip.toLowerCase();
}

/**
 * Stable client key so one user cannot exhaust the shared bucket for everyone.
 * Prefer authenticated user id when present; otherwise client IP
 * (requires app.set("trust proxy", …) behind Azure / load balancers).
 */
function clientKey(req) {
  const userId =
    req.user?._id ||
    req.user?.id ||
    req.user?.userId ||
    req.auth?.id ||
    req.auth?.userId;

  if (userId) return `u:${String(userId)}`;

  // req.ip is correct only when trust proxy is set (see server.js)
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
  return `ip:${ip}`;
}

function shouldSkipRateLimit() {
  // Escape hatch for one-off bulk imports — never leave this on in real prod traffic
  if (process.env.RATE_LIMIT_DISABLED === "true") return true;
  // Local / mobile-app sandbox only
  return isDev;
}

/**
 * Create a rate limiter middleware for Express routes.
 * @param {string} endpoint - The name of the endpoint (for logging / Redis prefix).
 * @param {number} [timeWindow=15] - The time window in minutes.
 * @param {number} [maxRequests=200] - The maximum number of requests allowed per client.
 * @returns {Function} Express middleware function for rate limiting.
 */
function createRateLimiter(endpoint, timeWindow = 15, maxRequests = 200) {
  if (shouldSkipRateLimit()) {
    return (req, res, next) => next();
  }

  const windowMs = timeWindow * 60 * 1000;
  const safeName = String(endpoint)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);

  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // Per-client key — fixes "one user hits limit → every user blocked"
    keyGenerator: clientKey,
    // Skip CORS preflight (does not hit DB / handlers meaningfully)
    skip: (req) => req.method === "OPTIONS",
    store: createRateLimitStore(`rl:${safeName}:`, windowMs),
    // trust proxy is set intentionally in server.js for Azure
    validate: { trustProxy: false },
    handler: (req, res) => {
      try {
        const {
          recordRateLimited,
        } = require("../services/security/ipThreatService");
        recordRateLimited(req, { endpoint });
      } catch (_) {
        /* never block the 429 response on logging failure */
      }
      return sendResponse({
        res,
        statusCode: 429,
        translationKey: `Too many requests to ${endpoint}. Please try again later.`,
        error: {
          message: `Too many requests to ${endpoint}. Please try again later.`,
        },
      });
    },
  });
}

module.exports = createRateLimiter;
module.exports.clientKey = clientKey;
module.exports.shouldSkipRateLimit = shouldSkipRateLimit;
