const { getActiveEndDateQuery } = require("../../../commonModules/loyalty/rewards/utils/rewardEndDate");
const Challenge = require("@GlobalChallengeModel");

/**
 * Fetch active global challenges
 * (no organizer dependency)
 */
const getActiveGlobalChallenges = async ({ keyword, timezone = "UTC" }) => {
  const query = {
    status: "active",
    ...getActiveEndDateQuery(timezone),
  };

  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  return Challenge.find(query)
    .populate("tierLimit")
    .populate("reward.specialTicket.ticket")
    .lean();
};

module.exports = {
  getActiveGlobalChallenges
};
