const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const promoCodeService = require("./reviewsService");





const getReviews = async (req, res) => {
  let {
    organization,keyword
  } = req.query;

  const user = req.user._id;
  const timezone = req.user.timezone;
  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: ["organization"],
    })
  )
    return;


  // Prepare the review data
  let data = {
    organization,
    keyword
  };

  try {
    const reviews = await promoCodeService.getReviews(data);
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
        translationKey: "Reviews_getd_successfully",
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


module.exports = {
  getReviews,


};