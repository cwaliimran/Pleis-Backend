/**
 * Who may read which transactions (Requirement Set #8; Filters v5 §2.2, §2.5).
 *
 *   Super admin  every company; may narrow by Company (companyOrganizer) and
 *                organizations. Sees the superadmin-only figures.
 *   Organizer    their own company only; a Company parameter is ignored and
 *                organizations are intersected with their own.
 *   Manager      the organizations they are assigned to (the auth middleware
 *                maps a manager onto their organizer and sets originalUserId).
 *   Anyone else  (guest app users, staff) is refused.
 */
const { resolveAnalyticsScope } = require("../../../../helperUtils/analyticsScope");

async function resolveTransactionScope(req) {
  const userType = req.user?.userType;
  if (userType !== "admin" && userType !== "organizer") {
    const err = new Error("forbidden");
    err.statusCode = 403;
    throw err;
  }
  const isSuperAdmin = userType === "admin";

  // The resolver reads companyOrganizer / organizations from the query; an
  // organizer's company is always their own, whatever the query says.
  const scope = await resolveAnalyticsScope({
    user: req.user,
    query: {
      companyOrganizer: isSuperAdmin ? req.query?.companyOrganizer : undefined,
      organizations: req.query?.organizations || req.query?.organization,
    },
  });

  return {
    isSuperAdmin,
    isManager: Boolean(req.user?.originalUserId),
    companyOrganizer: scope.companyOrganizer,
    organizations: scope.organizations,
  };
}

module.exports = { resolveTransactionScope };
