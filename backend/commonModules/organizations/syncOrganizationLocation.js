/**
 * An organization's location is always its primary venue's location.
 *
 * organization.location is what Near You, maps and distance sorting read, so it
 * must never come from any other venue or from a stale form value. Call this
 * after anything that creates, edits or re-assigns a venue, or changes which
 * venue is primary. With no primary venue the organization keeps its location.
 */
const Venues = require("@VenuesModel");
const Organizations = require("@OrganizationModel");

/** The primary venue's location, or null when there is none with coordinates. */
async function primaryVenueLocation(organizationId, { session } = {}) {
  if (!organizationId) return null;
  const primary = await Venues.findOne({
    organization: organizationId,
    isPrimary: true,
    status: { $ne: "deleted" },
  })
    .select("location")
    .session(session || null)
    .lean();
  const coords = primary?.location?.coordinates;
  return Array.isArray(coords) && coords.length === 2 ? primary.location : null;
}

/** Copies the primary venue's location onto the organization. Returns true when it did. */
async function syncOrganizationLocation(organizationId, { session } = {}) {
  const location = await primaryVenueLocation(organizationId, { session });
  if (!location) return false;
  await Organizations.updateOne(
    { _id: organizationId },
    { $set: { location } },
    { session: session || undefined },
  );
  return true;
}

module.exports = { syncOrganizationLocation, primaryVenueLocation };
