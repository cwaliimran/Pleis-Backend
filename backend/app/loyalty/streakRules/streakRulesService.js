const streakRulesRepo = require("./streakRulesRepository");
const { formatReward } = require("./formatters/formatReward");

const getStreakRulesByCompanyOrganizerService = async ({
  companyOrganizer
}) => {

  const StreakRules = await streakRulesRepo.getStreakRulesByCompanyOrganizer({
    companyOrganizer,
  });


  return {
    StreakRules
  };
};


module.exports = {
  getStreakRulesByCompanyOrganizerService,

};
