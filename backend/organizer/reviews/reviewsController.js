const {
  sendResponse,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const promoCodeService = require("./reviewsService");





const getReviews = async (req, res) => {
  let {
    organization,keyword
  } = req.query;

  const organizer = req.user._id;
  let organizationArray=[]

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
    const reviews = await promoCodeService.getReviews(data);
 

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