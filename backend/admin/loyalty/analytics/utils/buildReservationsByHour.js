const buildReservationsByHour = (rows = []) => {
  const map = {};

  // initialize all 8 intervals (0-3, 4-6, ..., 20-23)
  for (let i = 0; i < 8; i++) {
    map[i] = 0;
  }

  // fill data
  rows.forEach(r => {
    const hour = r._id;
    const interval = Math.floor(hour / 3); // group hours into 3-hour intervals
    map[interval] = r.count || 0;
  });

  // format like "0-3", "4-6", etc.
  return Object.keys(map).map(interval => {
    const startHour = interval * 3;
    const endHour = startHour + 2;
    return {
      time: `${startHour}-${endHour}`,
      count: map[interval],
    };
  });
};

module.exports = { buildReservationsByHour };