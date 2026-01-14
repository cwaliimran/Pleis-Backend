const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const promoCodeService = require("./promoCodeService");





const usePromoCode = async (req, res) => {
let {
  promoCode,
  companyOrganizer,
} = req.body;

const userId = req.user._id;
const timezone = req.user.timezone;

if (
  !validateParams(req, res, {
    rawData: [
      "companyOrganizer", 
      "promoCode"
    ],
  })
) return;
  let data = {
    companyOrganizer,
    userId,
promoCode,
  };
  try {
    const PromoCode = await promoCodeService.usePromoCode(data);
  
    if (PromoCode.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: `PromoCode_used_failed_${PromoCode.error}`,
      });
    }
    else{
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "PromoCode_used_successfully",
      data: PromoCode, 
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
  usePromoCode,


};