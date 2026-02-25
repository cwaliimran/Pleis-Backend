const Challenge = require("@GlobalChallengeModel");

/**
 * Fetch active global challenges
 * (no organizer dependency)
 */
const getActiveGlobalChallenges = async ({ now, keyword }) => {
  const query = {
    status: "active",
    endDate: { $gte: now }
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
