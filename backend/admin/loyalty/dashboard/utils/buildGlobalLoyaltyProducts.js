const { getFullImageUrl } = require("@utils/imageHelper");

const buildGlobalLoyaltyProducts = (rows = {}, limit = 4) => {
  const buildSection = (items = []) => {
    if (!items.length) return [];

    const maxUsers = Math.max(...items.map(item => item.totalUsersUsed || 0), 1);
    const maxPoints = Math.max(...items.map(item => item.pointsUsed || 0), 1);

    return items
      .map(item => {
        const normalizedUsers = (item.totalUsersUsed || 0) / maxUsers;
        const normalizedPoints = (item.pointsUsed || 0) / maxPoints;

        const engagement = Math.round(
          (0.7 * normalizedUsers + 0.3 * normalizedPoints) * 100
        );

        return {
          rewardId: item._id,
          rewardTitle: item.rewardTitle || "Unknown Reward",
          rewardDescription: item.rewardDescription || "",
          rewardImage: item.rewardImage
            ? getFullImageUrl(item.rewardImage)
            : "",
          pointsUsed: Math.round(item.pointsUsed || 0),
          claimLimit: item.claimLimit,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          status: item.status || "",
          totalUsersUsed: item.totalUsersUsed || 0,
          engagement
        };
      })
      .sort((a, b) => b.totalUsersUsed - a.totalUsersUsed)
      .slice(0, limit);
  };

  return {
    mostPopularRewards: buildSection(rows.mostPopularRewards),
    expiredRewards: buildSection(rows.expiredRewards),
    limitReward: buildSection(rows.limitReward)
  };
};

module.exports = { buildGlobalLoyaltyProducts };