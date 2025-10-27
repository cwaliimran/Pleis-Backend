const { User } = require("../../models/UserModel"); // Assuming this is the User model path
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getCurrentDateInTimezone,
  validateParams,
} = require("../../helperUtils/responseUtil");
const { getEvents } = require("./mapsService");

const getMapsData = async (req, res) => {

  try {
    const requestData = { ...(req.body || {}) };
    // const { latitude = 0, longitude = 0, radiusKm = 0 } = requestData;
    const { page, limit } = parsePaginationParams(req);
    //add pagination and keyword to requestData
    requestData.page = page;
    requestData.limit = limit;
    requestData.timezone = req.user.timezone || "Asia/Karachi";

    if (!validateParams(req, res, { enumFields: { "filter.type": ["events", "places", "all"] } })) return;

    let status = true;
    let result = {};
    if (requestData?.filter?.type === "events") {
      ({ status, result } = await getEvents(requestData));
    }

    if (status === false) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server_error",
        error: result,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "data_fetched_successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

module.exports = {
  getMapsData,
};
