const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const promoCodeService = require("./promoCodeService");





const createPromoCode = async (req, res) => {
  let {
    title,
    description,
    promoCode,
    discountType,
    discountValue,
    maxDiscountCap,
    maxCountPerUser,
    expiryDate,
    maxUsage,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: [
        "title",
        "description",
        "discountType",
        "discountValue",
        "expiryDate",
        "maxUsage",
        "promoCode"
      ],
    })
  ) return;
  expiryDate = convertTimezoneToUtc(
    expiryDate,
    timezone,
  );
  let data = {
    companyOrganizer: userId,
    title,
    promoCode,
    description,
    discountType,
    discountValue,
    maxDiscountCap,
    expiryDate,
    maxUsage,
    maxCountPerUser,
  };
  try {
    const PromoCode = await promoCodeService.createPromoCode(data);
    if (!PromoCode) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "PromoCode_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "PromoCode_created_successfully",
      data: PromoCode,
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
const getPromoCodes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { promoCodes, meta } = await promoCodeService.getPromoCodes({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promoCodes_fetched_successfully",
      data: promoCodes,
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
const updatePromoCode = async (req, res) => {
  const { id } = req.params;
  let {
    title,
    description,
    discountType,
    discountValue,
    promoCode,
    maxDiscountCap,
    maxCountPerUser,
    status,
    expiryDate,
    maxUsage,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;
  expiryDate = convertTimezoneToUtc(
    expiryDate,
    timezone,
  );
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    companyOrganizer: userId,
    title,
    description,
    promoCode,
    discountType,
    discountValue,
    status,
    maxDiscountCap,
    expiryDate,
    maxUsage,
    maxCountPerUser,
  };


  try {
    const updated = await promoCodeService.updatePromoCode(id, data);
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

const deletePromoCode = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await promoCodeService.deletePromoCode(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "PromoCode_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PromoCode_deleted_successfully",
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
  createPromoCode,
  getPromoCodes,
  updatePromoCode,
  deletePromoCode,

};