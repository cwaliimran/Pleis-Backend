const {
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { getActiveStreaksByOrganizer } = require("../../../admin/loyalty/streaks/streaksRepository");


const getStreakRulesByCompanyOrganizer = async ({ companyOrganizer }) => {
  const StreakRules = await getActiveStreaksByOrganizer(companyOrganizer);
  return StreakRules;
};




module.exports = {
  getStreakRulesByCompanyOrganizer,
};
