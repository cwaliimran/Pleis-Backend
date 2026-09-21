/**
 * Minimal geohash encode/decode for Redis geo-cell cache keys.
 * No external dependency — base32 geohash (Niemeyer).
 *
 * Precision guide (approx cell size):
 *   4 → ~39km × 20km  (city / metro)
 *   5 → ~4.9km × 4.9km (neighborhood)
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function encodeGeohash(latitude, longitude, precision = 5) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        idx = idx * 2 + 1;
        lngMin = mid;
      } else {
        idx = idx * 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }

    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Decode geohash to cell center + error bounds.
 * @returns {{ lat: number, lng: number, error: { lat: number, lng: number } } | null}
 */
function decodeGeohash(hash) {
  if (!hash || typeof hash !== "string") return null;

  let evenBit = true;
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  for (let i = 0; i < hash.length; i++) {
    const cd = BASE32.indexOf(hash[i]);
    if (cd === -1) return null;

    for (let mask = 16; mask > 0; mask >>= 1) {
      if (evenBit) {
        const mid = (lngMin + lngMax) / 2;
        if (cd & mask) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (cd & mask) latMin = mid;
        else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }

  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    error: {
      lat: (latMax - latMin) / 2,
      lng: (lngMax - lngMin) / 2,
    },
  };
}

module.exports = {
  encodeGeohash,
  decodeGeohash,
};
