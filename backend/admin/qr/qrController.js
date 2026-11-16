const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");
const mongoose = require("mongoose");
const QrService = require("./qrService");

const REQUIRED_TARGET_FIELDS = {
  organization: ["organizationId"],
  event: ["eventId"],
  loyalty: ["loyaltyId"],
  checkInOrder: ["venueId"],
  checkInTableID: ["venueId", "deliveryOptionId"],
};

// #59: the server issues the code's token and link; the target is checked and
// the organization / venue / table label are stored next to it (qrLinks).
const createQr = async (req, res) => {
  const { globalQrType } = req.body || {};
  const required = REQUIRED_TARGET_FIELDS[globalQrType];
  if (!required) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_type" });
  }
  const missing = required.find((field) => !req.body[field] || !mongoose.isValidObjectId(req.body[field]));
  if (missing) {
    return sendResponse({ res, statusCode: 400, translationKey: `${missing}_is_required` });
  }

  try {
    const Qr = await QrService.createQr({ ...req.body, creator: req.user?._id });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Qr_created_successfully",
      data: Qr,
    });
  } catch (error) {
    if (error?.statusCode) {
      return sendResponse({ res, statusCode: error.statusCode, translationKey: error.message, error });
    }
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};


const getQrs = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  try {


    const { Qrs, meta } = await QrService.getQrs({
      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
      userId: req.user?._id,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Qrs_fetched_successfully",
      data: Qrs,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};




const deleteQr = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await QrService.deleteQr(req.params.id);
    if (!deleted) {
      return sendResponse({ res, statusCode: 404, translationKey: "Qr_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "Qr_deleted_successfully" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};











module.exports = {
  createQr,
  getQrs,
  deleteQr,
};
