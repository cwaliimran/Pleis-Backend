
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const globalReferralService = require("./globalReferralService");

const createGlobalReferral = async (req, res) => {
let {
  rewardAmount,
  type,
  minimumPurchases,
  purchaseThresholdAmount,
  expiryDate,
  status,
} = req.body;
const userId = req.user._id;
const timezone = req.user.timezone;
if (
  !validateParams(req, res, {
    rawData: [
      "rewardAmount", 
      "type", 
      "minimumPurchases",
      "expiryDate",
      "purchaseThresholdAmount",
    ],
  })
) return;

  // Timing slots validation
        expiryDate = convertTimezoneToUtc(
          expiryDate,
          timezone,
        );
  let data = {
    creator:userId,
rewardAmount,
  type,
  minimumPurchases,
  expiryDate,
  purchaseThresholdAmount,
  status,
  };
  try {
    const GlobalReferral = await globalReferralService.createGlobalReferral(data);
    if (!GlobalReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "GlobalReferral_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "GlobalReferral_created_successfully",
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
  const { keyword, status = "active", date, range,type="global" } = req.query;
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
      translationKey: "GlobalReferrals_fetched_successfully",
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
  rewardAmount,
  minimumPurchases,
  purchaseThresholdAmount,
  referralLimit,
  referrerPoints,
  expiryDate,
  status,
} = req.body;
const userId = req.user._id;
const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id","creater"],
      objectIdFields: ["id","creater"],
    })
  )
    return;

  let data = {
    id,
    creater,
    referralLimit,
    referrerPoints,
    userId,
rewardAmount,
  minimumPurchases,
  purchaseThresholdAmount,
  expiryDate,
  status,
  };
        expiryDate = convertTimezoneToUtc(
          expiryDate,
          timezone,
        );
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
        translationKey: "updateGlobalReferral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "updateGlobalReferral_updated_successfully",
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
        translationKey: "GlobalReferral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "GlobalReferral_deleted_successfully",
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
      translationKey: "GlobalReferrals_fetched_successfully",
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
  getUserGlobalReferrals
};