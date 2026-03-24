const months = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const buildTotalTrend = (salesData = [], revenueData = []) => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const createYearMap = () => ({
    [currentYear]: new Array(12).fill(0),
    [previousYear]: new Array(12).fill(0)
  });

  const process = (data) => {
    const map = createYearMap();

    for (let i = 0; i < data.length; i++) {
      const yearData = data[i];
      const yearArr = map[yearData.year];
      if (!yearArr) continue;

      const monthsArr = yearData.months || [];
      for (let j = 0; j < monthsArr.length; j++) {
        const m = monthsArr[j];
        const idx = m.month - 1;
        if (idx >= 0 && idx < 12) {
          yearArr[idx] = Number(m.totalPoints || 0);
        }
      }
    }

    return Object.keys(map)
      .sort((a, b) => b - a)
      .map((year) => {
        const arr = map[year];
        return {
          year: +year,
          data: arr.map((val, i) => ({
            month: months[i],
            total: Number(val.toFixed(2)) 
          }))
        };
      });
  };

  return {
    salesTrend: process(salesData),
    revenueTrend: process(revenueData)
  };
};

module.exports = { buildTotalTrend };