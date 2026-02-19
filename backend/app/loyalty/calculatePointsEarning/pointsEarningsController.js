const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./pointsEarningsService");
const { NotificationTypes } = require("@NotificationsModel");


const calculatePoints = async (req, res) => {
  try {
    let userId = null;
    const { companyOrganizer, totalSpending, user } = req.body;
    if (user) {
      userId = user;
    } else {
      userId = req.user._id;
    }
    const { pointsEarnings } = await service.calculatePoints({
      userId,
      companyOrganizer,
      totalSpending
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_points_fetched_successfully",
      data: pointsEarnings,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  calculatePoints,
};
