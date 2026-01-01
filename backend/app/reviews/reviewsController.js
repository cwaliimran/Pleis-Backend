const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose
const promoCodeService = require("./reviewsService");





const createReviews = async (req, res) => {
  let {
    organization,
    event,
    rating,
    comment,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;
  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: ["organization", "event", "rating", "comment"],
    })
  )
    return;

  // Validate rating is between 0 and 5
  if (rating < 0 || rating > 5) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "Invalid_rating_value",
      data: { error: "Rating must be between 0 and 5" },
    });
  }

  // Prepare the review data
  let data = {
    organization,
    event,
    rating,
    comment,
    user,
  };

  try {
    const reviews = await promoCodeService.createReviews(data);
    console.log("Reviews", reviews);

    if (reviews.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "PromoCode_used_failed",
        data: { error: reviews.error },
      });
    } else {
      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "Reviews_created_successfully",
        data: reviews,
      });
    }
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












const getReviews = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range,organizationId } = req.query;
  try {
    if (!organizationId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_id_is_required",
      });
    }

    organizationId = new mongoose.Types.ObjectId(organizationId);
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { reviews, meta } = await promoCodeService.getReviews({
      timezone,
      page,
      limit,
      keyword,
      organizationId,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reviews_fetched_successfully",
      data: reviews,
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
  createReviews,
  getReviews


};