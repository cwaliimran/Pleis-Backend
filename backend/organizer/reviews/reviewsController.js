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
 if (!organization) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "Missing_organization_param",
    });
  }

  const user = req.user._id;
  const timezone = req.user.timezone;


  const organizationArray = organization.split(',');  // Convert the comma-separated string into an array

  // Prepare the review data
  let data = {
    organization: organizationArray,
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