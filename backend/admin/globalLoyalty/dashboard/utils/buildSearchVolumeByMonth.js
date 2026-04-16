const months = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const buildSearchVolumeByMonth = (rows = []) => {
  const buckets = Array(12).fill(0);

  for (const r of rows) {
    const date = r.lastSearchedAt || r.createdAt;
    if (!date) continue;

    const m = new Date(date).getMonth();
    if (m >= 0 && m < 12) {
      buckets[m] += r.count || 0;
    }
  }

  return months.map((month, index) => ({
    month,
    search: buckets[index]
  }));
};

module.exports = { buildSearchVolumeByMonth };
