/**
 * Single opaque `filterKey` token for home → global/search see-all.
 *
 * Frontend:
 *   - draws UI from section.key
 *   - sends section.filterKey as-is in ?filterKey=
 *
 * Formats:
 *   forYouOrganizations | nearYouOrganizations | topPicks | …
 *   tag:<tagObjectId>
 *   customCategory:<customCategoryObjectId>
 */

const STATIC_FILTER_KEYS = new Set([
  "forYouOrganizations",
  "nearYouOrganizations",
  "topPicks",
  "trendingOrganizations",
  "newlyListedOrganizations",
  "forYouEvents",
  "thisWeekEvents",
  "loyaltyClubs",
]);

const TAG_PREFIX = "tag:";
const CUSTOM_CATEGORY_PREFIX = "customCategory:";

function normalizeId(id) {
  return id ? String(id) : null;
}

/** Build the opaque token home puts on each explorabile section. */
function buildSectionFilterKey(section) {
  if (!section?.key) return null;

  if (section.key === "customCategoryByTags") {
    const id = normalizeId(section.tagId);
    return id ? `${TAG_PREFIX}${id}` : null;
  }

  if (section.key === "customCategory") {
    const id = normalizeId(section.customCategoryId || section._id);
    return id ? `${CUSTOM_CATEGORY_PREFIX}${id}` : null;
  }

  if (STATIC_FILTER_KEYS.has(section.key)) {
    return section.key;
  }

  return null;
}

/**
 * Parse ?filterKey= into { kind, id?, raw }.
 * kind: static | tag | customCategory | unknown
 */
function parseFilterKeyToken(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return { kind: "unknown", raw };

  if (STATIC_FILTER_KEYS.has(raw)) {
    return { kind: "static", id: raw, raw };
  }

  if (raw.startsWith(TAG_PREFIX)) {
    const id = raw.slice(TAG_PREFIX.length).trim();
    return { kind: "tag", id, raw };
  }

  if (raw.startsWith(CUSTOM_CATEGORY_PREFIX)) {
    const id = raw.slice(CUSTOM_CATEGORY_PREFIX.length).trim();
    return { kind: "customCategory", id, raw };
  }

  // Legacy: bare ObjectId or title — resolved later by search
  return { kind: "legacy", id: raw, raw };
}

module.exports = {
  STATIC_FILTER_KEYS,
  TAG_PREFIX,
  CUSTOM_CATEGORY_PREFIX,
  buildSectionFilterKey,
  parseFilterKeyToken,
};
