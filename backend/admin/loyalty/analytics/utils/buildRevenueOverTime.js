const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const conditionTypes = [
  "fixedPrice",
  "minimumSpendOnLocation",
  "prepayOption",
  "noCondition",
  "customText",
];

const buildRevenueOverTime = (rows = []) => {
  // initialize map with all months + all conditionTypes = 0
  const map = {};

  months.forEach((_, index) => {
    const monthKey = index + 1;
    map[monthKey] = {};

    conditionTypes.forEach(type => {
      map[monthKey][type] = 0;
    });
  });

  // fill data
  rows.forEach(r => {
    const { month, conditionType, revenue } = r;

    if (!map[month]) map[month] = {};
    if (!map[month][conditionType]) map[month][conditionType] = 0;

    map[month][conditionType] += Math.round(revenue || 0);
  });

  // convert to chart format
  return months.map((month, index) => {
    const monthIndex = index + 1;

    return {
      month,
      ...map[monthIndex], // spreads all condition types
    };
  });
};

module.exports = { buildRevenueOverTime };