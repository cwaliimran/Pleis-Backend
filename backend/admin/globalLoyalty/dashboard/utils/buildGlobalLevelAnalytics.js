const buildGlobalLevelAnalytics = (rows = []) => {
  const totalUsers = rows.reduce((sum, row) => sum + (row.users || 0), 0);

  if (!totalUsers) {
    return {
      globalLevelAnalytics: rows.map(row => ({
        name: row.levelName || "Unknown",
        count: row.users || 0,
        percent: 0
      }))
    };
  }

  const analytics = rows.map(row => {
    const count = row.users || 0;
    const exactPercent = (count / totalUsers) * 100;
    const basePercent = Math.floor(exactPercent);

    return {
      name: row.levelName || "Unknown",
      count,
      percent: basePercent,
      remainder: exactPercent - basePercent
    };
  });

  let assigned = analytics.reduce((sum, item) => sum + item.percent, 0);
  let remaining = 100 - assigned;

  analytics
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(item => {
      if (remaining > 0) {
        item.percent += 1;
        remaining--;
      }
    });

  return {
    globalLevelAnalytics: analytics
      .map(({ name, count, percent }) => ({
        name,
        count,
        percent
      }))
  };
};

module.exports = {
  buildGlobalLevelAnalytics
};