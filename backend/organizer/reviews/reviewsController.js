const {
  sendResponse,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const promoCodeService = require("./reviewsService");





const getReviews = async (req, res) => {
  let {
    organization, keyword, sortBy, sortOrder
  } = req.query;

  const organizer = req.user._id;
  let organizationArray = []
  const SORT_FIELDS = ["userName",];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy)
      ? "invalid_sort_by_field"
      : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }
  if (organization) {
    organizationArray = organization.split(',');
  }
  else {
    organizationArray = [];
  }


  // Prepare the review data
  let data = {
    organization: organizationArray,
    keyword,
    organizer,
    sortBy,
    sortOrder
  };

  try {
    const { data1, meta } = await promoCodeService.getReviews(data);


    if (data1.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "PromoCode_used_failed",
        data: { error: data1.error },
      });
    } else {
      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "Reviews_getd_successfully",
        data: data1,
        meta: meta,
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