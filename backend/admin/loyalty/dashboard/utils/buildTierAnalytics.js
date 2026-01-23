const buildTierAnalytics = (members = [], tiers = []) => {
  const tierIdToTitle = {};
  const tierCounts = {};

  // Initialize ALL tiers
  for (const t of tiers) {
    tierIdToTitle[t._id.toString()] = t.title;
    tierCounts[t.title] = 0;
  }

  // Count members
  for (const m of members) {
    if (!m.level) continue;

    const title = tierIdToTitle[m.level.toString()];
    if (!title) continue;

    tierCounts[title]++;
  }

  const total = Object.values(tierCounts).reduce((a, b) => a + b, 0) || 1;

  return Object.entries(tierCounts).map(([name, count]) => ({
    name,
    count,
    percent: Math.round((count / total) * 100),
  }));
};

module.exports = { buildTierAnalytics };