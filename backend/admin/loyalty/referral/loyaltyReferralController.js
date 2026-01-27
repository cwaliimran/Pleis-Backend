
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const formatLoyaltyListing = require("./formatter/formatLoyaltyListing");
const LoyaltyReferralService = require("./loyaltyReferralService");

const createLoyaltyReferral = async (req, res) => {
  let {
    userPoints,
    referrerPoints,
    minimumPurchases,
    status,


    referralLimit,
    companyOrganizer
  } = req.body;

  const timezone = req.user.timezone;

  // Required fields validation
  if (
    !validateParams(req, res, {
      rawData: [
        "userPoints",
        "referrerPoints",
        "minimumPurchases",
        "referralLimit",
        "companyOrganizer"
      ],
    })
  ) return;

 

  // Prepare data for creation
  let data = {
    companyOrganizer: companyOrganizer,
    userPoints,
    referrerPoints,
    type:"loyalty",
    minimumPurchases,
    referralLimit,
    status: status || "inactive",
  };

  try {
    const LoyaltyReferral = await LoyaltyReferralService.createLoyaltyReferral(data);

    if (!LoyaltyReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "loyalty_referral_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "loyalty_referral_created_successfully",
      data: LoyaltyReferral,
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


const getLoyaltyReferrals = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status , date, range,type="loyalty", companyOrganizer} = req.query;
  try {
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_parameter_missing",
      });
    }
    const timezone = req.user.timezone;
    const { LoyaltyReferral, meta } = await LoyaltyReferralService.getLoyaltyReferrals({
        timezone,
      page,
      limit,
      keyword,
      status,
      companyOrganizer,
      date,
      range,
      type
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referrals_fetched_successfully",
      data: LoyaltyReferral,
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


const updateLoyaltyReferral = async (req, res) => {
  const { id } = req.params;
let {
  userPoints,
  minimumPurchases,
  referralLimit,
  referrerPoints,
  status,
} = req.body;
const companyOrganizer = req.user._id;
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
    companyOrganizer,
  minimumPurchases,
  status,
  };

  try {
    const updated = await LoyaltyReferralService.updateLoyaltyReferral(data);
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
        translationKey: "update_loyalty_referral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "update_loyalty_referral_updated_successfully",
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

const deleteLoyaltyReferral = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await LoyaltyReferralService.deleteLoyaltyReferral(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "loyalty_referral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referral_deleted_successfully",
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






const getUserLoyaltyReferrals = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status , date,type="loyalty", companyOrganizer} = req.query;
  try {
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_parameter_missing",
      });
    }
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { LoyaltyReferral, meta } = await LoyaltyReferralService.getUserLoyaltyReferrals({
        timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      companyOrganizer,
      type
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referrals_fetched_successfully",
      data: LoyaltyReferral.map(item => formatLoyaltyListing(item))
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
    const LoyaltyReferral = await LoyaltyReferralService.resetUserReferralLimits(limit);

    if (!LoyaltyReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "loyalty_referral_reset_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "loyalty_referral_reset_successfully",
      data: LoyaltyReferral,
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
  createLoyaltyReferral,
  getLoyaltyReferrals,
  updateLoyaltyReferral,
  // deleteReservation,
  deleteLoyaltyReferral,
  // getReservationDetails,
  // getUserReservations,
  // updateUserReservationStatus,
  // updateUserReservation,
  getUserLoyaltyReferrals,
  resetUserReferralLimits
};