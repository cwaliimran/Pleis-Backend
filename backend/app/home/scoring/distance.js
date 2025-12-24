/**
 * Distance scoring (geo relevance)
 * Input coordinates MUST be lat/lng
 */

const { clamp01 } = require("./normalize");

const EARTH_RADIUS_KM = 6371;
const MAX_DISTANCE_KM = 50;

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

const distanceScore = (distanceKm) => {
  if (distanceKm > MAX_DISTANCE_KM) return 0;
  return clamp01((MAX_DISTANCE_KM - distanceKm) / MAX_DISTANCE_KM);
};

module.exports = {
  haversineKm,
  distanceScore,
  MAX_DISTANCE_KM
};
