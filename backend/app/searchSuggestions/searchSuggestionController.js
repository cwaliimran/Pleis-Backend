const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
  parsePaginationParams,
} = require("../../helperUtils/responseUtil");

const service = require("./searchSuggestionService");


const recordUserSearch = async (req, res) => {
  const { keyword = "", advanceFilters = {}, location, radiusKm = 50 } = req.body;
  const userId = req.user?._id || null;

  try {
    await service.recordSearchService({
      userId,
      keyword,
      filters: {
        categories: advanceFilters.categories || [],
        venueTypes: advanceFilters.venueTypes || [],
        tags: advanceFilters.tags || [],
        genre: advanceFilters.genre || [],
      },
      location: location || null,
      radiusKm: Number(radiusKm)
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "search_recorded_successfully",
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


const getUserSearchHistory = async (req, res) => {
  const userId = req.user._id;

  try {
    const data = await service.getUserSearches(userId);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "searches_fetched_successfully",
      data,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getTrendingSearches = async (req, res) => {
  let { limit = 10, days = 3, latitude, longitude, radiusKm = 50 } = req.query;

  if (!latitude || !longitude) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "location_required",
    });
  }

  const center = {
    type: "Point",
    coordinates: [Number(longitude), Number(latitude)]
  };

  const data = await service.getTrendingSearchesService({
    days: Number(days),
    limit: Number(limit),
    center,
    radiusKm: Number(radiusKm),
  });

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "trending_searches_fetched_successfully",
    data,
  });
};


module.exports = {
  recordUserSearch,
  getUserSearchHistory,
  getTrendingSearches,
};
