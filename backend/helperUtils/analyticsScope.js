/**
 * Company / organization scope for the analytics screens
 * (Requirement Set #128, #131; Defects Report v1.5, D-06).
 *
 *   Super admin  global by default; may pick a company (companyOrganizer) and
 *                organizations of that company.
 *   Organizer    always limited to their own company; may narrow to some of
 *                their organizations.
 *   Manager      limited to the organizations they are assigned to.
 *
 * Always returns an explicit organizations list once any scope applies, because
 * some analytics collections (orders) carry no companyOrganizer field. An empty
 * list means "no organizations in scope" and must match nothing.
 *
 * @returns {Promise<{ companyOrganizer: string|undefined, organizations: mongoose.Types.ObjectId[]|undefined }>}
 */
const mongoose = require("mongoose");

const toIdList = (value) => {
  if (value === undefined || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,%]/);
  return raw
    .map((v) => String(v).trim())
    .filter((v) => mongoose.Types.ObjectId.isValid(v))
    .map((v) => new mongoose.Types.ObjectId(v));
};

const orgIdsOfCompany = async (companyOrganizer) => {
  const orgs = await mongoose.connection.db
    .collection("organizations")
    .find({ creator: new mongoose.Types.ObjectId(String(companyOrganizer)), status: { $ne: "deleted" } })
    .project({ _id: 1 })
    .toArray();
  return orgs.map((o) => o._id);
};

const intersect = (requested, allowed) => {
  const allowedSet = new Set(allowed.map(String));
  return requested.filter((id) => allowedSet.has(String(id)));
};

const resolveAnalyticsScope = async (req) => {
  const { companyOrganizer: qCompany, organizations: qOrganizations } = req.query || {};
  const requested = toIdList(qOrganizations);
  const userType = req.user?.userType;

  // Organizer or manager (the auth middleware maps a manager onto their organizer).
  if (userType === "organizer") {
    const companyOrganizer = String(req.user._id);
    let allowed = await orgIdsOfCompany(companyOrganizer);

    if (req.user.originalUserId) {
      const { getOrganizationsAsStaff } = require("../staff/organizations/organizationService");
      const assigned = ((await getOrganizationsAsStaff(req.user.originalUserId)) || []).map((o) => o._id);
      allowed = intersect(allowed, assigned);
    }

    const organizations = requested.length ? intersect(requested, allowed) : allowed;
    return { companyOrganizer, organizations };
  }

  // Super admin: global unless a company and/or organizations are chosen.
  const companyOrganizer =
    qCompany && mongoose.Types.ObjectId.isValid(String(qCompany)) ? String(qCompany) : undefined;

  if (companyOrganizer) {
    const allowed = await orgIdsOfCompany(companyOrganizer);
    const organizations = requested.length ? intersect(requested, allowed) : allowed;
    return { companyOrganizer, organizations };
  }

  return { companyOrganizer: undefined, organizations: requested.length ? requested : undefined };
};

module.exports = { resolveAnalyticsScope, toIdList };
