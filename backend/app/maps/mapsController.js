const { User } = require("../../models/UserModel"); // Assuming this is the User model path
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
} = require("../../helperUtils/responseUtil");
const { getEvents, getPlaces, getAllData } = require("./mapsService");

const getMapsData = async (req, res) => {

  try {
    const requestData = { ...(req.body || {}) };
    // const { latitude = 0, longitude = 0, radiusKm = 0 } = requestData;
    const { page, limit } = parsePaginationParams(req);
    //add pagination and keyword to requestData
    requestData.page = page;
    requestData.limit = limit;
    requestData.timezone = req.user.timezone || "Asia/Karachi";

    let keysEnum = []
    if (requestData?.filter?.type === "events") {
      keysEnum = ["live", "today", "thisWeek"]
    } else if (requestData?.filter?.type === "places") {
      keysEnum = ["openNow", "topRated", "trending"]
    } else if (requestData?.filter?.type === "all") {
      keysEnum = ["live", "today", "thisWeek"]
    }

    if (!validateParams(req, res, {
      enumFields: {
        "filter.type": ["events", "places", "all"],
        "filter.key": keysEnum
      }
    })) return;

    let status = true;
    let result = {};
    if (requestData?.filter?.type === "events") {
      ({ status, result } = await getEvents(requestData));
    } else if (requestData?.filter?.type === "places") {
      ({ status, result } = await getPlaces(requestData));
    } else { //"all"
      ({ status, result } = await getAllData(requestData));
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
