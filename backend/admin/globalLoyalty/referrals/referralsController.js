const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const refferralsServices = require("./referralsServices");

const createSettings = async (req, res) => {
  try {
    const { referralLimit, userPoints, referralPoints } = req.body;
    const createID = req.user._id;

    if (!referralLimit && referralLimit !== 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "referral_limit_required",
      });
    }
    if (!userPoints && userPoints !== 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "user_points_required",
      });
    }

    if (!referralPoints && referralPoints !== 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "referral_points_required",
      });
    }

    if (!createID) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "creator_required",
      });
    }

    // Final data to save
    const data = {
      referralLimit,
      userPoints,
      referralPoints,
      createID,
    };

    const response = await refferralsServices.createSettings(data);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "referral_settings_created_successfully",
      data: response,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "something_went_wrong",
      error,
    });
  }
};

module.exports = {
  createSettings,
};