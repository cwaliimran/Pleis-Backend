/**
 * Home feed production limits for dynamic content (orgs / events).
 * Reference catalogs (tags, tag types, venue types, categories) are
 * Redis-cached in full — do not put those limits here.
 *
 * Geo-cell cache (see utils/homeGeoCache.js):
 *   precision 5 ≈ neighborhood; TTL 60s for location-scoped sections.
 */

/** Hard max for nearby org lists (home nearYou, /organizations/nearby). */
const NEARBY_MAX_DISTANCE_KM = 50;

/**
 * Cap requested nearby radius so clients beyond NEARBY_MAX_DISTANCE_KM
 * share the same geo cache key / query radius (e.g. 500 → 50).
 */
const clampNearbyRadiusKm = (requestedKm) => {
  const n = Number(requestedKm);
  const base = Number.isFinite(n) && n > 0 ? n : NEARBY_MAX_DISTANCE_KM;
  return Math.min(base, NEARBY_MAX_DISTANCE_KM);
};

module.exports = {
  clampNearbyRadiusKm,

  /**
   * Hard max for nearby org lists (home nearYou, /organizations/nearby).
   * Requested radiusKm may be smaller; never larger than this.
   */
  NEARBY_MAX_DISTANCE_KM,

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

  /** Geohash precision for home geo cache keys (5 ≈ ~5km neighborhood) */
  HOME_GEO_HASH_PRECISION: 5,

  /**
   * Finer geohash for Near You cache keys only (~150m).
   * Query still uses exact GPS; key buckets tiny movements for L1/Redis hits.
   */
  NEARBY_RANK_GEOHASH_PRECISION: 7,

  /**
   * Distance relevance: score = exp(-distance_km / τ).
   * τ = 5 → strong preference inside ~1.5 km, still soft out to 50 km.
   */
  NEARBY_DISTANCE_TAU_KM: 5,

  /** Redis TTL (seconds) for geo-scoped home sections (nearYou, popularEvents, …) */
  HOME_GEO_SECTION_TTL: 60,

  /** Redis TTL (seconds) for global home sections that are not already catalog-cached */
  HOME_GLOBAL_SECTION_TTL: 120,

  /**
   * Process-local L1 TTL (seconds) for home bundles — skips Azure Redis GET on warm.
   * Shorter than Redis TTL; cleared on API restart / invalidate.
   */
  HOME_L1_MEMORY_TTL: 30,
};
