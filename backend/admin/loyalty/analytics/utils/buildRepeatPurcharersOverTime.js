const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildRepeatPurcharersOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.repeatPurchasers || 0);
  });

  return months.map((month, index) => ({
    month,
    repeatPurchasers: map[index + 1] || 0
  }));
};

module.exports = { buildRepeatPurcharersOverTime };