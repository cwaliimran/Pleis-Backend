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
    else {
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
const validatePromoCode = async (req, res) => {
  let {
    promoCode,
    companyOrganizer,
    amount,
  } = req.body;

  const userId = req.user._id;

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
    amount,
  };
  try {
    const PromoCode = await promoCodeService.validatePromoCode(data);

    if (PromoCode.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: PromoCode.error,
      });
    }
    else {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "promo_code_validated_successfully",
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
  validatePromoCode


};