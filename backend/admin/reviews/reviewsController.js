const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("../../helperUtils/responseUtil");

const reviewService = require("./reviewsService");





const getReviews = async (req, res) => {
  let {
    companyOrganizer, keyword, page, limit, sortBy, sortOrder
  } = req.query;
  const SORT_FIELDS = ["userName"];
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
  if (!companyOrganizer) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "organization_required",
    });
  }
  let organizer = companyOrganizer;
  let organizationArray = []
  const organization = null;
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
    page: page || 1, limit: limit || 10,
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc"
  };

  try {
    const { reviews, meta } = await reviewService.getReviews(data);

    if (reviews.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "review_used_failed",
        data: { error: reviews.error },
      });
    } else {
      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "Reviews_getd_successfully",
        data: reviews,
        meta,
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
const updateReviews = async (req, res) => {
  const { id } = req.params;
  let {
    comment
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  let data = {
    comment
  };


  try {
    const updated = await reviewService.updateReviews(id, data);
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
        translationKey: "review_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_updated_successfully",
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
const deleteReview = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await reviewService.deleteReview(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "review_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "review_deleted_successfully",
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
  getReviews,
  updateReviews,
  deleteReview

};