const {
  sendResponse,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const StreakRuleservice = require("./streakRulesService");

const getStreakRules = async (req, res) => {
  const keyword = req.query.keyword || "";

  try {
    const userId = req.user._id;
    const timezone = req.user?.timezone || "UTC";
    const companyOrganizer = req.query.companyOrganizer;
    const { StreakRules } =
      await StreakRuleservice.getStreakRulesByCompanyOrganizerService({
        userId,
        companyOrganizer,
        timezone,
        keyword,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streak_rules_fetched_successfully",
      data: StreakRules,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};




module.exports = {
  getStreakRules,
};
