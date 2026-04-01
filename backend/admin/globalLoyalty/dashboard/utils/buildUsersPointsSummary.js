const { getFullImageUrl } = require("@utils/imageHelper");

const buildUsersPointsSummary = (rows = {}, limit = 7) => {
  const buildSection = (items = [], sortBy = "engagement") => {
    if (!items.length) return [];

    const maxPoints = Math.max(...items.map(i => i.totalPoints || 0), 1);
    const maxTx = Math.max(...items.map(i => i.totalTransactions || 0), 1);

    // 🔥 remove duplicates (keep BEST record)
    const uniqueMap = new Map();
    items.forEach(item => {
      const existing = uniqueMap.get(item.userId);

      if (!existing || item.totalPoints > existing.totalPoints) {
        uniqueMap.set(item.userId, item);
      }
    });

    return [...uniqueMap.values()]
      .map(item => {
        const normalizedPoints = (item.totalPoints || 0) / maxPoints;
        const normalizedTx = (item.totalTransactions || 0) / maxTx;

        const engagement = Math.round(
          (0.6 * normalizedPoints + 0.4 * normalizedTx) * 100
        );

        return {
          userId: item.userId,
          totalPoints: Math.round(item.totalPoints || 0),
          totalTransactions: item.totalTransactions || 0,

          user: {
            _id: item.user?._id || null,
            firstName: item.user?.firstName || "",
            lastName: item.user?.lastName || "",
            profileIcon: item.user?.profileIcon
              ? getFullImageUrl(item.user.profileIcon)
              : ""
          },

          globalWallet: {
            lifetimePoints: item.globalWallet?.lifetimePoints || 0
          },

          level: {
            _id: item.level?._id || null,
            name: item.level?.name || ""
          },

          engagement
        };
      })
      .sort((a, b) => {
        if (sortBy === "points") return b.totalPoints - a.totalPoints;
        if (sortBy === "transactions") return b.totalTransactions - a.totalTransactions;
        return b.engagement - a.engagement;
      })
      .slice(0, limit);
  };

  return {
    // 🔥 engagement-based ranking
    mostEngagedMembers: buildSection(rows.mostEngagedMembers, "engagement"),

    // 🔥 points-based ranking
    highestPointsMembers: buildSection(rows.highestPointsMembers, "points"),
  };
};

module.exports = { buildUsersPointsSummary };