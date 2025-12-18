const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const UpdatesService = require("./updatesService");
const mongoose = require("mongoose");




const createUpdates = async (req, res) => {
let {
  title,
  description,
  event,
  image,
  status,
  companyOrganizer

} = req.body;

const userId =new  mongoose.Types.ObjectId(companyOrganizer);
const timezone = req.user.timezone;

if (
  !validateParams(req, res, {
    rawData: [
      "title", 
      "description", 
      "event",
      "image",
      "companyOrganizer" 
    ],
  })
) return;
  let data = {
    companyOrganizer:userId,
  title,
  description,
  event,
  image,
  status,
  };
  try {
    const Updates = await UpdatesService.createUpdates(data);
    if (!Updates) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Updates_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Updates_created_successfully",
      data: Updates,
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
const getUpdatess = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range ,companyOrganizer} = req.query;
  try {
if (!companyOrganizer) {
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "companyorganizer_missing",
  });
}

    const userId = new mongoose.Types.ObjectId(companyOrganizer);
    const timezone = req.user.timezone;
    const { updates, meta } = await UpdatesService.getUpdatess({
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
      translationKey: "Updatess_fetched_successfully",
      data: updates,
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
const updateUpdates = async (req, res) => {
  const { id } = req.params;
let {
  title,
  description,
  event,
  image,
  status,
} = req.body;
const userId = req.user._id;
const timezone = req.user.timezone;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  let data = {
    companyOrganizer:userId,
title,
  description,
  event,
  image,
  status,
  };

 
  try {
    const updated = await UpdatesService.updateUpdates(id, data);
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

const deleteUpdates = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await UpdatesService.deleteUpdates(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Updates_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Updates_deleted_successfully",
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







const getevents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range ,companyorganizer} = req.query;
  try {


    const userId = new mongoose.Types.ObjectId(companyorganizer);
    const timezone = req.user.timezone;
if (!companyorganizer) {
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "companyorganizer_missing",
  });
}

    const { events, meta } = await UpdatesService.getevents({
        timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: events,
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
module.exports = {
  createUpdates,
  getUpdatess,
  updateUpdates,
  deleteUpdates,
getevents,
};