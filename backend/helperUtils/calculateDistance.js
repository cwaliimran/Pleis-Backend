/**
 * Calculates distance between two coordinates using Haversine formula.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @param {string} unit - "km" or "mi"
 * @returns {number} - Distance in given unit
 */
function calculateDistance(lat1, lon1, lat2, lon2, unit = "kilometer") {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = unit === "mile" ? 3958.8 : 6371.0; // Radius of Earth in miles or kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return {
    distance: Number(distance.toFixed(2)),
    unit: unit === "mile" ? "mi" : "km",
  };
}

module.exports = { calculateDistance };

  