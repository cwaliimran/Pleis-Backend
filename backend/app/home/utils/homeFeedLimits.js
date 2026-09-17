/**
 * Home feed production limits for dynamic content (orgs / events).
 * Reference catalogs (tags, tag types, venue types, categories) are
 * Redis-cached in full — do not put those limits here.
 */
module.exports = {
  /** Items per fixed home section (forYou, nearYou, events, …) */
  HOME_SECTION_LIMIT: 10,

  /** Max orgs scanned before grouping by primary tag */
  TAG_ORGS_SCAN: 150,

  /** Max orgs kept per tag group in the feed */
  TAG_LIMIT_PER_GROUP: 10,

  /** Max tag-based sections returned to the feed builder */
  TAG_GROUPS_MAX: 12,

  /** Max objects inside each custom category section */
  CUSTOM_CATEGORY_OBJECTS: 10,

  /** Redis TTL (seconds) for reference catalogs */
  CATALOG_TTL_SECONDS: 86400,
};
