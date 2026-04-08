const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildByOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.totalAmount || 0);
  });

  return months.map((month, index) => ({
    month,
    value: map[index + 1] || 0
  }));
};

module.exports = { buildByOverTime };