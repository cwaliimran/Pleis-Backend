const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildViewOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.viewCount || 0);
  });

  return months.map((month, index) => ({
    month,
    value: map[index + 1] || 0
  }));
};

module.exports = { buildViewOverTime };