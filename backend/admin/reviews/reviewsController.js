const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("../../helperUtils/responseUtil");

const reviewService = require("./reviewsService");





const getReviews = async (req, res) => {
  let {
    companyOrganizer,keyword
  } = req.query;
if(!companyOrganizer){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "organization_required",
  });
}
let organizer=companyOrganizer;
  let organizationArray=[]
const organization =null;
if(organization){
   organizationArray = organization.split(','); 
}
  else{
    organizationArray = [];
  }
 

  // Prepare the review data
  let data = {
    organization: organizationArray,
    keyword,
    organizer,
  };

  try {
    const {reviews, meta} = await reviewService.getReviews(data);
 console.log("reviews",reviews );

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
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
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