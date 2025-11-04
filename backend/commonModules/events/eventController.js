const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertUtcToTimezone,
  isValidNanoid,
} = require("../../helperUtils/responseUtil");
const { getVenueDetails } = require("../venues/venuesService");

const eventService = require("./eventService");

const createEvent = async (req, res) => {

  let { timezone, _id: userId } = req.user;

  const {
    basicInfo = {},
    schedule = {}
  } = req.body;

  let validateData = {
    rawData: [
      "basicInfo.title",
      "basicInfo.organization",
      "basicInfo.venue",
      "basicInfo.categories",
    ],
    objectIdFields: ["basicInfo.organization", "basicInfo.venue", "basicInfo.categories"],
  }

  //find if venue exists
  const venueItem = await getVenueDetails(basicInfo.venue, ['location.coordinates']);
  if (!venueItem) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_venue",
    });
  }

  let eventType = schedule.type || "oneTime";

  if (eventType === "oneTime") {
    // Validate both start and end date for one-time events
    validateData.dateFields = {
      "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
      "schedule.endDateTime": "YYYY-MM-DD hh:mm A"
    };
  }

  const recurringDetails = schedule.recurringDetails || {};
  if (recurringDetails.isEnabled) {
    // Recurring event validation
    validateData.dateFields = {
      "schedule.startDateTime": "YYYY-MM-DD hh:mm A"
    };

    validateData.rawData.push("schedule.recurringDetails");
    validateData.rawData.push("schedule.recurringDetails.frequency");
    validateData.rawData.push("schedule.recurringDetails.interval");
    validateData.rawData.push("schedule.recurringDetails.endType");

    // Conditional validation based on endType
    if (recurringDetails.endType === "onDate") {
      validateData.dateFields["schedule.recurringDetails.endDate"] = "YYYY-MM-DD";
    } else if (recurringDetails.endType === "afterOccurrences") {
      validateData.rawData.push("schedule.recurringDetails.occurrences");
    }

    // Validate daysOfWeek if frequency is weekly or monthly
    if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
      validateData.rawData.push("schedule.recurringDetails.daysOfWeek");
    }
  }

  if (!validateParams(req, res, validateData)) return;

  // Construct event data per schema
  const eventData = {
    basicInfo: {
      media: {
        name: basicInfo.media?.name || "",
        type: basicInfo.media?.type || "image", // Ensure 'image' as default
      },
      title: basicInfo.title.trim(),
      description: basicInfo.description?.trim() || "",
      organization: basicInfo.organization,
      venue: basicInfo.venue,
      venueLocation: venueItem.location, //set venueLocation from venue
      categories: Array.isArray(basicInfo.categories) ? basicInfo.categories : [],
      tags: Array.isArray(basicInfo.tags) ? basicInfo.tags : [],
    },
    schedule: {
      type: schedule.type || "oneTime",
      startDateTime: convertTimezoneToUtc(schedule.startDateTime, timezone, "YYYY-MM-DD hh:mm A"),
      endDateTime: convertTimezoneToUtc(schedule.endDateTime, timezone, "YYYY-MM-DD hh:mm A"),
      recurringDetails: schedule.recurringDetails || null,
    },
    creator: userId,
  };

  try {
    const event = await eventService.createEvent({ data: eventData });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "event_created_successfully",
      data: event,
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

const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", startDate, endDate, organization } = req.query;
  let { _id, timezone } = req.user;
  try {


    if (organization) {
      if (!validateParams(req, res, {
        objectIdFields: ["organization"],
      })) return;
    }

    if (startDate && !validateParams(req, res, {
      dateFields: {
        startDate: "YYYY-MM-DD",
      },
    })) return;

    if (endDate && !validateParams(req, res, {
      dateFields: {
        endDate: "YYYY-MM-DD",
      },
    })) return;

    let { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      status,
      creator: _id,
      startDate,
      endDate,
      organization,
      timezone,
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: events,
      meta: generateMeta(page, limit, meta.total),
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

const getPublicEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { events, meta } =
      await eventService.getPublicEvents({
        page,
        limit,
        keyword,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_events_fetched_successfully",
      data: events,
      meta: generateMeta(page, limit, meta.total),
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

const updateEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    image,
    tags,
    description,
    title,
    schedule,
  } = req.body);

  try {
    // Now validate schedule if provided
    if (data.schedule !== undefined) {
      let validateData = { rawData: [], dateFields: {} };
      const recurringDetails = data.schedule.recurringDetails;

      if (recurringDetails && recurringDetails.isEnabled) {
        validateData.dateFields = {
          "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
        };

        validateData.rawData.push("schedule.recurringDetails");
        validateData.rawData.push("schedule.recurringDetails.frequency");
        validateData.rawData.push("schedule.recurringDetails.interval");
        validateData.rawData.push("schedule.recurringDetails.endType");

        if (recurringDetails.endType === "onDate") {
          validateData.dateFields["schedule.recurringDetails.endDate"] = "YYYY-MM-DD";
        } else if (recurringDetails.endType === "afterOccurrences") {
          validateData.rawData.push("schedule.recurringDetails.occurrences");
        }

        if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
          validateData.rawData.push("schedule.recurringDetails.daysOfWeek");
        }

        if (!validateParams(req, res, validateData)) return;
      } else {
        validateData.dateFields = {
          "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
          "schedule.endDateTime": "YYYY-MM-DD hh:mm A",
        };

        if (!validateParams(req, res, validateData)) return;
      }
    }


    const updated = await eventService.updateEvent(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_updated_successfully",
      data: updated,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const deleteEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await eventService.deleteEvent(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_deleted_successfully",
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

const getEventDetails = async (req, res) => {
  let { id } = req.params;
  let { timezone } = req.user;
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
    let data = await eventService.getEventDetails(id, timezone);
    if (!data) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

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

const cloneEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    const clonedEvent = await eventService.cloneEvent(id);
    if (!clonedEvent) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "event_cloned_successfully",
      data: clonedEvent,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  createEvent,
  getEvents,
  getPublicEvents,
  cloneEvent,
  updateEvent,
  deleteEvent,
  getEventDetails,
};
