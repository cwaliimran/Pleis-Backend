
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
    expiryDate,
    referralLimit,
    organizerId
  } = req.body;

  const userId = req.user._id || organizerId;
  const timezone = req.user.timezone;

  // Required fields validation
  if (
    !validateParams(req, res, {
      rawData: [
        "userPoints",
        "referrerPoints",
        "minimumPurchases",
     
        "referralLimit",
        "expiryDate",
      ],
    })
  ) return;

  // Convert expiry date to UTC
  expiryDate = convertTimezoneToUtc(expiryDate, timezone);

  // Prepare data for creation
  let data = {
    companyOrganizer: userId,
    userPoints,
    referrerPoints,
    type:"loyalty",
    minimumPurchases,

    referralLimit,
    expiryDate,
    status:"inactive",
  };

  try {
    const LoyaltyReferral = await LoyaltyReferralService.createLoyaltyReferral(data);

    if (!LoyaltyReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "LoyaltyReferral_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "LoyaltyReferral_created_successfully",
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
  const { keyword, status = "active", date, range,type="loyalty" } = req.query;
  try {
    const companyOrganizer = req.user._id;
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
      translationKey: "LoyaltyReferrals_fetched_successfully",
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
  expiryDate,
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
  expiryDate,
  status,
  };
        expiryDate = convertTimezoneToUtc(
          expiryDate,
          timezone,
        );
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
        translationKey: "updateLoyaltyReferral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "updateLoyaltyReferral_updated_successfully",
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
        translationKey: "LoyaltyReferral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "LoyaltyReferral_deleted_successfully",
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
  const { keyword, status = "active", date, range,type="loyalty" } = req.query;
  try {
    const companyOrganizer = req.user._id;
    const timezone = req.user.timezone;
    const { LoyaltyReferral, meta } = await LoyaltyReferralService.getUserLoyaltyReferrals({
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
      translationKey: "LoyaltyReferrals_fetched_successfully",
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
        translationKey: "LoyaltyReferral_reset_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "LoyaltyReferral_reset_successfully",
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