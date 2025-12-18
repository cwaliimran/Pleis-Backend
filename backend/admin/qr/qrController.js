const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");
const mongoose = require("mongoose");
const QrService = require("./qrService");

const createQr = async (req, res) => {
  console.log("req.body", req.body);

  // Initialize variables
  var dateFields = {};
  var rawData = ["label", "globalQrType"];
  var objectIdFields = []; // Removed companyOrganizer

  // Handle organization type
  if (req.body.globalQrType === "organization") {
        if (!req.body.organizationId) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "organizationId_is_required",
    });
  }
    rawData.push("organizationId");
    objectIdFields.push("organizationId");
    req.body.organizationId = new mongoose.Types.ObjectId(req.body.organizationId);
  }

  // Handle event type
  if (req.body.globalQrType === "event") {
    if (!req.body.eventId) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "eventId_is_required",
    });
  }
    rawData.push("eventId");
    objectIdFields.push("eventId");
    req.body.eventId = new mongoose.Types.ObjectId(req.body.eventId);

  }
    if (req.body.globalQrType === "loyalty") {
    if (!req.body.loyaltyId) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "loyaltyId_is_required",
    });
  }
    rawData.push("loyaltyId");
    objectIdFields.push("loyaltyId");
    req.body.loyaltyId = new mongoose.Types.ObjectId(req.body.loyaltyId);

  }
      if (req.body.globalQrType === "checkInOrder") {
    if (!req.body.venueId) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "venueId_is_required",
    });
  }
    rawData.push("venueId");
    objectIdFields.push("venueId");
    req.body.venueId = new mongoose.Types.ObjectId(req.body.venueId);

  }
        if (req.body.globalQrType === "checkInTableID") {
    if (!req.body.organizationId||!req.body.tableNo) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "organizationId_is_required",
    });
  }
    rawData.push("organizationId");
    objectIdFields.push("organizationId");
    req.body.organizationId = new mongoose.Types.ObjectId(req.body.organizationId);
    req.body.tableNo = req.body.tableNo;

  }

  try {


    // Create Qr
    const Qr = await QrService.createQr(req.body);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Qr_created_successfully",
      data: Qr,
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
