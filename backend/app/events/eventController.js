const { isFavorited } = require("../favorites/favoriteService");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  isValidNanoid,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { getTicketings } = require("../ticketing/ticketingsService");

const eventService = require("./eventService");
const { default: mongoose } = require("mongoose");


const getNearbyEvents = async (req, res) => {
  const { latitude, longitude, radiusKm = 50 } = req.query;
  const { page, limit } = parsePaginationParams(req);
  let { timezone } = req.user;

  let queryData = {
    latitude,
    longitude,
    radiusKm,
    page,
    limit,
    timezone,
  };

  if (!validateParams(req, res, {
    queryParams: ["latitude", "longitude"],
  })) return;

  try {
    const { events, meta } = await eventService.getNearbyEvents(queryData);
    //check if events is empty
    if (!events || events.length === 0) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "nearby_events_fetched_successfully",
        data: [],
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "nearby_events_fetched_successfully",
      data: events,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}

const getNearbyEventsWithAdvanceFilters = async (req, res) => {
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
    queryParams: ["latitude", "longitude"],
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

  try {
    const { events, meta } = await eventService.getNearbyEventsWithAdvanceFilters(queryData);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "nearby_events_fetched_successfully",
      data: events || [],
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "internal_server",
      error,
    });
  }
};





const getEventDetails = async (req, res) => {
  let { id } = req.params;
  let { timezone, _id: userId, location: userLocation } = req.user;
  // Accept both nanoid and ObjectId for event id
  if (
    (!isValidNanoid(id) && !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    }))
  ) return;

  if (isValidNanoid(id)) {
    // If nanoid, resolve to ObjectId
    id = await eventService.getEventIdByNanoid(id);
  }


  try {
    let [data, Reservations,isFavoriteEvent = false] = await Promise.all([
      eventService.getEventDetails(userLocation, userId, id, timezone),
      eventService.getEventReservations(id,timezone),
      isFavorited(userId, id, 'event'),
    ]);

    console.log("Reservations", Reservations);
    if (!data?.event) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }
    data.event.isFavorite = isFavoriteEvent;
    data.Reservations = Reservations;

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_details_fetched_successfully",
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

const getEventTicketings = async (req, res) => {
  let { id } = req.params;
  let { timezone } = req.user;

  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;


  try {
    const ticketings = await getTicketings({ timezone, eventId: id });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_ticketings_fetched_successfully",
      data: ticketings,
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



module.exports = {
  getEventDetails,
  getNearbyEvents,
  getNearbyEventsWithAdvanceFilters,
  getEventTicketings
};
