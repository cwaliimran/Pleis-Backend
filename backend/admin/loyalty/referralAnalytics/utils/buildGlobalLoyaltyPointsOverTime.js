const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildGlobalLoyaltyPointsOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.points || 0);
  });

  return months.map((month, index) => ({
    month,
    points: map[index + 1] || 0
  }));
};

module.exports = { buildGlobalLoyaltyPointsOverTime };