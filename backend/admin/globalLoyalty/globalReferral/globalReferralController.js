
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const formatLoyaltyListing = require("./formatter/formatLoyaltyListing");
const globalReferralService = require("./globalReferralService");

const saveGlobalReferral = async (req, res) => {
  const {
    userPoints,
    referrerPoints,
    minimumPurchases,
    referralLimit,
    status,
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["userPoints", "referrerPoints", "minimumPurchases"],
    })
  ) return;

  try {
    const data = {
      userPoints,
      referrerPoints,
      minimumPurchases,
      referralLimit,
      status,
    };

    const globalReferral =
      await globalReferralService.saveGlobalReferral(data);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_referral_saved_successfully",
      data: globalReferral,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const getGlobalReferrals = async (req, res) => {
  try {
    const globalReferral =
      await globalReferralService.getGlobalReferrals();

    if (!globalReferral) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "global_referral_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_referral_fetched_successfully",
      data: globalReferral,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};


const deleteGlobalReferral = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await globalReferralService.deleteGlobalReferral(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "global_referral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_referral_deleted_successfully",
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};


const getUserGlobalReferrals = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range, type = "global" } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { globalReferral, meta } = await globalReferralService.getUserGlobalReferrals({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
      type
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_referrals_fetched_successfully",
      data: globalReferral.map(item => formatLoyaltyListing(item))
      ,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};






const resetUserReferralLimits = async (req, res) => {
  const limit = 0;


  try {
    const GlobalReferral = await globalReferralService.resetUserReferralLimits(limit);

    if (!GlobalReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "global_referral_reset_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "global_referral_reset_successfully",
      data: GlobalReferral,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  saveGlobalReferral,
  getGlobalReferrals,
  deleteGlobalReferral,
  getUserGlobalReferrals,
  resetUserReferralLimits
};