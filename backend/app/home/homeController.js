const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  validateParams,
  parsePaginationParams
} = require("../../helperUtils/responseUtil");
const { getHomeService } = require("./homeService");
const { globalSearchService, getGlobalFiltersService } = require("./globalSearch/globalSearchService");

const getHome = async (req, res) => {

  try {
    let { category } = req.body;
    // Validate category once
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_category_id",
      });
    }
    const { latitude, longitude, radiusKm = 50 } = req.query;
    const { location: savedLocation, timezone, _id: userId } = req.user;

    let userLocation = null;

    // 1️⃣ If query params exist → ALWAYS use them
    if (latitude !== undefined && longitude !== undefined) {
      const lng = parseFloat(longitude);
      const lat = parseFloat(latitude);

      // 0,0 means GLOBAL
      if (lng === 0 && lat === 0) {
        userLocation = null;
      } else {
        userLocation = {
          type: "Point",
          coordinates: [lng, lat],
        };
      }
    }
    // 2️⃣ Otherwise fallback to saved user location
    else if (savedLocation?.coordinates?.length === 2) {
      const [lng, lat] = savedLocation.coordinates;

      if (lng === 0 && lat === 0) {
        userLocation = null;        // Global again
      } else {
        userLocation = {
          type: "Point",
          coordinates: savedLocation.coordinates,
        };
      }
    }
    let queryData = {
      userLocation,
      userId,
      timezone: timezone || "Asia/Karachi",
      radiusKm: parseFloat(radiusKm),
      category,
    };

    const { status, data } = await getHomeService({ queryData });

    if (status === false) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server_error",
        error: data,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "data_fetched_successfully",
      data,
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

const globalSearch = async (req, res) => {
  const { latitude, longitude, keyword, type } = req.query;
  const { page, limit } = parsePaginationParams(req);
  let { timezone, _id: userId } = req.user || {};
  let { sort = "desc" } = req.body || {};
  const ctx = {
    keyword,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    page,
    limit,
    timezone,
    userId,
    type: type || "all",
    sort,
    advanceFilters: req.body?.advanceFilters || {},
  };

  try {
    const sections = await globalSearchService(ctx);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "search_results_fetched",
      data: sections,
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: err,
    });
  }
};


const globalFilters = async (req, res) => {
  try {
    const { _id: userId, timezone } = req.user || {};
    let { latitude = 0, longitude = 0, radiusKm = 50 } = req.query;
    const center = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)]
    };
    const filters = await getGlobalFiltersService(userId, timezone, center, radiusKm);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_filters_fetched_successfully",
      data: filters,
    });
  }
  catch (err) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: err,
    });
  }
};

module.exports = {
  getHome,
  globalSearch,
  globalFilters
};
