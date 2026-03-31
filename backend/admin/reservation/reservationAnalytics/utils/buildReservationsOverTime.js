const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildReservationsOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.totalReservations || 0);
  });

  return months.map((month, index) => ({
    month,
    value: map[index + 1] || 0
  }));
};

module.exports = { buildReservationsOverTime };