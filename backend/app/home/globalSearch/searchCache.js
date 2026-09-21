/**
 * Global search / filters Redis key layout (mirrors home geo-cell caching):
 *
 *   search:global:v1:...           — catalogs shared by all users
 *   search:geo:v1:...&geo=<hash>   — location-scoped (keyword search, nearYou, trending filters)
 *   search:user:v1:...&userId=…    — personalized filterKey sections (forYou*, loyaltyClubs)
 *
 * Do NOT put raw lat/lng into geo keys. Reuses home geohash precision + TTLs.
 */
const { cache } = require("@redisCache");
const {
  resolveGeoCell,
  extractLatLng,
} = require("../utils/homeGeoCache");
const {
  HOME_GEO_HASH_PRECISION,
  HOME_GEO_SECTION_TTL,
  HOME_GLOBAL_SECTION_TTL,
  HOME_L1_MEMORY_TTL,
  clampNearbyRadiusKm,
} = require("../utils/homeFeedLimits");

const GEO_NAMESPACE = "search:geo:v1";
const GLOBAL_NAMESPACE = "search:global:v1";
const USER_NAMESPACE = "search:user:v1";

function cacheSearchGeo({ section, geoHash, params = {}, ttl = HOME_GEO_SECTION_TTL, fetchFn }) {
  return cache({
    namespace: `${GEO_NAMESPACE}:${section}`,
    params: {
      geo: geoHash || "global",
      ...params,
    },
    ttl,
    fetchFn,
    deferStore: true,
    memoryTtl: HOME_L1_MEMORY_TTL,
  });
}

function cacheSearchGlobal({ section, params = {}, ttl = HOME_GLOBAL_SECTION_TTL, fetchFn }) {
  return cache({
    namespace: `${GLOBAL_NAMESPACE}:${section}`,
    params,
    ttl,
    fetchFn,
    deferStore: true,
    memoryTtl: HOME_L1_MEMORY_TTL,
  });
}

function cacheSearchUser({ section, userId, params = {}, ttl = HOME_GEO_SECTION_TTL, fetchFn }) {
  return cache({
    namespace: `${USER_NAMESPACE}:${section}`,
    params: {
      userId: userId ? String(userId) : "anon",
      ...params,
    },
    ttl,
    fetchFn,
    deferStore: true,
    memoryTtl: HOME_L1_MEMORY_TTL,
  });
}

/** Stable fingerprint for advanceFilters / category lists (sorted ids). */
function listFingerprint(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return [...arr].map(String).filter(Boolean).sort().join(",");
}

function advanceFiltersFingerprint(af = {}) {
  return [
    `c=${listFingerprint(af.categories)}`,
    `t=${listFingerprint(af.tags)}`,
    `g=${listFingerprint(af.genre)}`,
    `v=${listFingerprint(af.venueTypes)}`,
    `df=${Number(af.distanceFrom) || 0}`,
    `dt=${Number(af.distanceTo) || 0}`,
  ].join("&");
}

function normalizeKeyword(keyword) {
  if (keyword == null || keyword === "") return "";
  return String(keyword).trim().toLowerCase();
}

/**
 * Build GeoJSON point from lat/lng (NaN / 0,0 → null = global).
 */
function pointFromLatLng(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

module.exports = {
  GEO_NAMESPACE,
  GLOBAL_NAMESPACE,
  USER_NAMESPACE,
  HOME_GEO_HASH_PRECISION,
  cacheSearchGeo,
  cacheSearchGlobal,
  cacheSearchUser,
  resolveGeoCell,
  extractLatLng,
  clampNearbyRadiusKm,
  listFingerprint,
  advanceFiltersFingerprint,
  normalizeKeyword,
  pointFromLatLng,
};
