/**
 * Home feed Redis key layout (geo-cell caching):
 *
 *   home:global:v1:...           — shared, location-agnostic (banners, catalogs, referral)
 *   home:geo:v1:...&geo=<hash>   — shared within a geohash cell (nearYou, popularEvents, …)
 *   home:user:v1:...&userId=…    — cheap per-user overlays (forYou, promotions, loyalty)
 *
 * Do NOT put raw lat/lng or userId into geo keys. Precision 5 ≈ neighborhood;
 * users in the same cell share cache; Lahore vs another city get different cells.
 *
 * Global search / filters reuse the same geohash helpers via
 * globalSearch/searchCache.js (namespaces search:global|geo|user:v1).
 */
const { cache } = require("@redisCache");
const { encodeGeohash, decodeGeohash } = require("../../../helperUtils/geoHash");
const {
  HOME_GEO_HASH_PRECISION,
  HOME_GEO_SECTION_TTL,
  HOME_GLOBAL_SECTION_TTL,
  HOME_L1_MEMORY_TTL,
} = require("./homeFeedLimits");

const GEO_NAMESPACE = "home:geo:v1";
const GLOBAL_NAMESPACE = "home:global:v1";
const USER_NAMESPACE = "home:user:v1";

/**
 * Normalize GeoJSON Point | {lat,lng} | coordinates → { lat, lng } | null
 */
function extractLatLng(userLocation) {
  if (!userLocation) return null;

  if (
    Number.isFinite(userLocation.lat) &&
    Number.isFinite(userLocation.lng)
  ) {
    return { lat: userLocation.lat, lng: userLocation.lng };
  }

  const coords = userLocation.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // 0,0 is treated as "global" elsewhere in homeController
      if (lat === 0 && lng === 0) return null;
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Resolve geohash cell + stable GeoJSON Point at cell center for shared queries.
 * @returns {{ hash: string, centerPoint: { type: 'Point', coordinates: [lng, lat] } | null }}
 */
function resolveGeoCell(userLocation, precision = HOME_GEO_HASH_PRECISION) {
  const ll = extractLatLng(userLocation);
  if (!ll) {
    return { hash: "global", centerPoint: null };
  }

  const hash = encodeGeohash(ll.lat, ll.lng, precision) || "global";
  if (hash === "global") {
    return { hash: "global", centerPoint: null };
  }

  const decoded = decodeGeohash(hash);
  if (!decoded) {
    return {
      hash,
      centerPoint: {
        type: "Point",
        coordinates: [ll.lng, ll.lat],
      },
    };
  }

  return {
    hash,
    centerPoint: {
      type: "Point",
      coordinates: [decoded.lng, decoded.lat],
    },
  };
}

function cacheHomeGeo({ section, geoHash, params = {}, ttl = HOME_GEO_SECTION_TTL, fetchFn }) {
  return cache({
    namespace: `${GEO_NAMESPACE}:${section}`,
    params: {
      geo: geoHash || "global",
      ...params,
    },
    ttl,
    fetchFn,
    // Large geo bundles: gzip+Azure SET can add ~1s after DB work — don't block the response
    deferStore: true,
    memoryTtl: HOME_L1_MEMORY_TTL,
  });
}

function cacheHomeGlobal({ section, params = {}, ttl = HOME_GLOBAL_SECTION_TTL, fetchFn }) {
  return cache({
    namespace: `${GLOBAL_NAMESPACE}:${section}`,
    params,
    ttl,
    fetchFn,
    deferStore: true,
    memoryTtl: HOME_L1_MEMORY_TTL,
  });
}

function cacheHomeUser({ section, userId, params = {}, ttl = HOME_GEO_SECTION_TTL, fetchFn }) {
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

module.exports = {
  GEO_NAMESPACE,
  GLOBAL_NAMESPACE,
  USER_NAMESPACE,
  extractLatLng,
  resolveGeoCell,
  cacheHomeGeo,
  cacheHomeGlobal,
  cacheHomeUser,
  encodeGeohash,
  decodeGeohash,
};
