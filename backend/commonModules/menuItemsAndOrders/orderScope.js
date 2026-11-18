/**
 * Venue scope for order endpoints: the order must belong to a venue the
 * caller works for.
 *   admin      any order
 *   organizer  orders of their own company (a manager only their assigned venues)
 *   staff      orders of venues they are staff of
 *
 * Returns an async check `(order) => void` that throws a 403 "forbidden".
 */
const { resolveAnalyticsScope } = require("../../helperUtils/analyticsScope");

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function orderScopeCheck(req) {
  return async (order) => {
    const orgId = String(order.organization?._id || order.organization);
    const userType = req.user?.userType;
    if (userType === "admin") return;
    if (userType === "staff") {
      const { getOrganizationsAsStaff } = require("../../staff/organizations/organizationService");
      const orgs = (await getOrganizationsAsStaff(req.user._id)) || [];
      if (orgs.some((o) => String(o._id || o) === orgId)) return;
      throw httpError(403, "forbidden");
    }
    if (userType === "organizer") {
      const scope = await resolveAnalyticsScope({ user: req.user, query: {} });
      if ((scope.organizations || []).some((id) => String(id) === orgId)) return;
      throw httpError(403, "forbidden");
    }
    throw httpError(403, "forbidden");
  };
}

module.exports = { orderScopeCheck };
