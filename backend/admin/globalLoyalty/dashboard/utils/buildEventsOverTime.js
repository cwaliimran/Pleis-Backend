const months = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const uildEventsOverTime = (rows = []) => {
  const map = {};
  rows.forEach(r => {
    map[r._id] = r.events;
  });

  return months.map((m, i) => ({
    month: m,
    events: map[i + 1] || 0
  }));
};

module.exports = { buildEventsOverTime };
