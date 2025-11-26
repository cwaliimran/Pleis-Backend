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
    requestData.userId = req.user._id;

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

      const { latitude, longitude, keyword } = req.query;
      const { page, limit } = parsePaginationParams(req);
      let { timezone, _id: userId } = req.user;

      const { sort = "asc", advanceFilters = {} } = req.body;
      const {
        time,
        distanceFrom = 0,
        distanceTo = 50,
        dateFrom,
        dateTo,
        categories = [],
        venueTypes = [],
        genre = [],
        tags = [],
      } = advanceFilters;

      // --- Validation ---
      const validateData = {
        rawData: [],
        objectIdFields: [],
      };

      // // Validate sort
      // if (sort && !["asc", "desc"].includes(sort)) {
      //   return sendResponse({ res, statusCode: 400, translationKey: "invalid_sort_order" });
      // }

      // Validate time filter
      const validTimes = ["live", "today", "tomorrow", "thisWeek", "all"];
      if (time && !validTimes.includes(time)) {
        return sendResponse({ res, statusCode: 400, translationKey: "invalid_time_filter" });
      }

      // Validate dateFrom and dateTo using dateFields in validateParams
      if (dateFrom && !validateParams(req, res, { dateFields: { dateFrom: "YYYY-MM-DD" } })) return;
      if (dateTo && !validateParams(req, res, { dateFields: { dateTo: "YYYY-MM-DD" } })) return;

      // Validate categories
      if (categories && Array.isArray(categories)) {
        for (const categoryId of categories) {
          if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return sendResponse({ res, statusCode: 400, translationKey: "invalid_category_id" });
          }
        }
      }

      // Use centralized query validation
      if (!validateParams(req, res, validateData)) return;

      // --- Build queryData ---
      const queryData = {
        latitude,
        longitude,
        keyword,
        page,
        limit,
        timezone,
        sort,
        userId,
        advanceFilters: {
          time,
          distanceFrom,
          distanceTo,
          dateFrom,
          dateTo,
          categories,
          venueTypes,
          tags,
          genre,
        },
      };


      ({ status, result } = await getEvents(queryData));
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
