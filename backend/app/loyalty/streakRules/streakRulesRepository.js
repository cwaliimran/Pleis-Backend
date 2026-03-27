const {
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { getActiveStreaksByOrganizer, StreakRulesByCompanyOrganizerGroupByAllPoints } = require("../../../admin/loyalty/streaks/streaksRepository");
const { getUSerStreaskBuOrganizerAndUser } = require("../../../admin/loyalty/usersStreaks/usersStreaksRepository");
const { formatNextStreakRule } = require("./formatters/formatNextStreakRule");



const getStreakRulesByCompanyOrganizer = async ({ companyOrganizer }) => {
  const StreakRules = await getActiveStreaksByOrganizer(companyOrganizer);
  return StreakRules;
};
const getStreakRulesByCompanyOrganizerGroupByAllPoints = async (companyOrganizer, userId) => {
  const [StreakRules, userStreaks] = await Promise.all([
    StreakRulesByCompanyOrganizerGroupByAllPoints(companyOrganizer, userId),
    getUSerStreaskBuOrganizerAndUser(companyOrganizer, userId),
  ]);
  const formatedResponce =await formatNextStreakRule(StreakRules, userStreaks);
  return formatedResponce;
};



module.exports = {
  getStreakRulesByCompanyOrganizer,
  getStreakRulesByCompanyOrganizerGroupByAllPoints
};
