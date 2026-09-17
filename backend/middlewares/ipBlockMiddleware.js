const { sendResponse } = require("../helperUtils/responseUtil");
const {
  getClientIp,
  isIpBlocked,
  recordBlockedHit,
} = require("../services/security/ipThreatService");

/**
 * Reject permanently / temporarily blocked client IPs early.
 */
function ipBlockMiddleware(req, res, next) {
  // Skip health / webhooks
  const path = req.path || "";
  if (
    path === "/health" ||
    path === "/api" ||
    path.startsWith("/api/v1/webhooks")
  ) {
    return next();
  }

  const ip = getClientIp(req);
  if (!ip) return next();

  isIpBlocked(ip)
    .then((blocked) => {
      if (!blocked) return next();
      recordBlockedHit(req);
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "access_denied_for_ip",
        error: { message: "Your IP has been blocked due to suspicious activity" },
      });
    })
    .catch(() => next());
}

module.exports = { ipBlockMiddleware };
