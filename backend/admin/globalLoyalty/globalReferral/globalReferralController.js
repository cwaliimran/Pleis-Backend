
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

const createGlobalReferral = async (req, res) => {
  let {
    userPoints,
    referrerPoints,
    minimumPurchases,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;

  // Required fields validation
  if (
    !validateParams(req, res, {
      rawData: [
        "userPoints",
        "referrerPoints",
        "minimumPurchases",
      ],
    })
  ) return;



  // Prepare data for creation
  let data = {
    creator: userId,
    userPoints,
    referrerPoints,
    type:"global",
    minimumPurchases,
    status:"inactive",
  };

  try {
    const GlobalReferral = await globalReferralService.createGlobalReferral(data);

    if (!GlobalReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "global_referral_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "global_referral_created_successfully",
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


const getGlobalReferrals = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status , date, range,type="global" } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { globalReferral, meta } = await globalReferralService.getGlobalReferrals({
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
      data: globalReferral,
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


const updateGlobalReferral = async (req, res) => {
  const { id, creater } = req.params;
let {
  userPoints,
  minimumPurchases,
  referralLimit,
  referrerPoints,
  status,
} = req.body;
const userId = req.user._id;
const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    id,
    userPoints,
    referralLimit,
    referrerPoints,
    userId,
  minimumPurchases,
  status,
  };

  try {
    const updated = await globalReferralService.updateGlobalReferral(data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "update_global_referral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "update_global_referral_updated_successfully",
      data: updated,
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
  const { keyword, status = "active", date, range,type="global" } = req.query;
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
  createGlobalReferral,
  getGlobalReferrals,
  updateGlobalReferral,
  // deleteReservation,
  deleteGlobalReferral,
  // getReservationDetails,
  // getUserReservations,
  // updateUserReservationStatus,
  // updateUserReservation,
  getUserGlobalReferrals,
  resetUserReferralLimits
};