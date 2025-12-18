const Challenge = require("@GlobalChallengeModel");

/**
 * Fetch active global challenges
 * (no organizer dependency)
 */
const getActiveGlobalChallenges = async ({ now }) => {
  return Challenge.find({
    status: "active",
    endDate: { $gte: now }
  })
    .populate("tierLimit")
    .lean();
};

module.exports = {
  getActiveGlobalChallenges
};
