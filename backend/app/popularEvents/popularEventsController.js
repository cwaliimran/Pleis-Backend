const {
  sendResponse,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const popularEventsService = require("./popularEventsService");


const popularEvents = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req);

    let { location: userLocation, timezone, _id: userId } = req.user;
    const { latitude = 0, longitude = 0, radiusKm = 50 } = req.query;
    let { category } = req.body;

    if (latitude && longitude) {
      userLocation = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    // Call service to get popular events
    const { data, meta } = await popularEventsService.getPopularEventsService({ page, limit, skip, userLocation, userId, timezone, category, radiusKm });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "popular_events_fetched_successfully",
      data: data || [],
      meta: meta || {},
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  popularEvents,
};