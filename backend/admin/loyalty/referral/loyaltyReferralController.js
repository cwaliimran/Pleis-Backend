const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const formatLoyaltyListing = require("./formatter/formatLoyaltyListing");
const LoyaltyReferralService = require("./loyaltyReferralService");


/* =========================================================
   SETTINGS (Singleton Per Company)
========================================================= */

const createLoyaltyReferral = async (req, res) => {
  const {
    userPoints,
    referrerPoints,
    minimumPurchases,
    referralLimit,
    status,
    companyOrganizer,
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: [
        "userPoints",
        "referrerPoints",
        "minimumPurchases",
        "referralLimit",
        "companyOrganizer",
      ],
    })
  ) return;

  const data = {
    companyOrganizer,
    userPoints,
    referrerPoints,
    minimumPurchases,
    referralLimit,
    status: status || "inactive",
    type: "loyalty",
  };

  try {
    const result =
      await LoyaltyReferralService.createLoyaltyReferral(data);

    return sendResponse({
      res,
      statusCode: 200, // upsert → 200 instead of 201
      translationKey: "loyalty_referral_saved_successfully",
      data: result,
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


const getLoyaltyReferrals = async (req, res) => {
  let { companyOrganizer } = req.query;

  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }

  if (!companyOrganizer) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "companyOrganizer_parameter_missing",
    });
  }

  try {
    const result =
      await LoyaltyReferralService.getLoyaltyReferrals({
        companyOrganizer,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referral_fetched_successfully",
      data: result, // single object (or null)
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


const updateLoyaltyReferral = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  const {
    userPoints,
    minimumPurchases,
    referralLimit,
    referrerPoints,
    status,
  } = req.body;

  const data = {
    id,
    userPoints,
    minimumPurchases,
    referralLimit,
    referrerPoints,
    status,
  };

  try {
    const updated =
      await LoyaltyReferralService.updateLoyaltyReferral(data);

    if (updated?.error) {
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
        translationKey: "loyalty_referral_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referral_updated_successfully",
      data: updated,
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


const deleteLoyaltyReferral = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    const deleted =
      await LoyaltyReferralService.deleteLoyaltyReferral(id);

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
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};



/* =========================================================
   USER REFERRAL RECORDS (Pagination Preserved)
========================================================= */

const getUserLoyaltyReferrals = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  let { keyword, status, date, type = "loyalty", companyOrganizer } = req.query;

  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }

  if (!companyOrganizer) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "companyOrganizer_parameter_missing",
    });
  }

  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;

    const { LoyaltyReferral, meta } =
      await LoyaltyReferralService.getUserLoyaltyReferrals({
        timezone,
        page,
        limit,
        keyword,
        status,
        userId,
        date,
        companyOrganizer,
        type,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referrals_fetched_successfully",
      data: LoyaltyReferral.map(item =>
        formatLoyaltyListing(item)
      ),
      meta,
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



const resetUserReferralLimits = async (req, res) => {
  const limit = 0;

  try {
    const result =
      await LoyaltyReferralService.resetUserReferralLimits(limit);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_referral_reset_successfully",
      data: result,
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



module.exports = {
  createLoyaltyReferral,
  getLoyaltyReferrals,
  updateLoyaltyReferral,
  deleteLoyaltyReferral,
  getUserLoyaltyReferrals,   // pagination preserved
  resetUserReferralLimits,
};