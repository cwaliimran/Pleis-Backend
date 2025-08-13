const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertUtcToTimezone,
} = require("../../helperUtils/responseUtil");

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
      "basicInfo.category",
    ],
    objectIdFields: ["basicInfo.organization", "basicInfo.venue", "basicInfo.category"],

  }

  let eventType = schedule.type || "oneTime";

  if (eventType === "oneTime") {
    // One-time event specific validation
    validateData.dateFields = {
      "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
      "schedule.endDateTime": "YYYY-MM-DD hh:mm A",
    };
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
      category: basicInfo.category || null,
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

  console.log("eventData in createEvent:", eventData);

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
  const { keyword, status = "active" } = req.query;
  let { _id, timezone } = req.user;
  try {
    let { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      status,
      creator: _id,
    });
    // Deep clone events to avoid mutating original objects (especially if using Mongoose docs)
    let formattedEvents = events.map(event => {
      let formattedEvent = JSON.parse(JSON.stringify(event));
      if (formattedEvent.schedule && formattedEvent.schedule.startDateTime) {
        formattedEvent.schedule.startDateTime = convertUtcToTimezone(
          formattedEvent.schedule.startDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }
      if (formattedEvent.schedule && formattedEvent.schedule.endDateTime) {
        formattedEvent.schedule.endDateTime = convertUtcToTimezone(
          formattedEvent.schedule.endDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }
      return formattedEvent;
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: formattedEvents,
      meta: generateMeta(page, limit, meta.total),
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
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
      error: error.message,
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
    venues,
    location,
    pinned,
    image,
    tags,
    description,
    title,
  } = req.body);

  try {
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
      error: error.message,
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
      error: error.message,
    });
  }
};

const getEventDetails = async (req, res) => {
  const { id } = req.params;
  let { timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    let event = await eventService.getEventDetails(id);
    if (!event) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    // Convert dates to user's timezone
    //convert event to object
    event = JSON.parse(JSON.stringify(event));
    if (event.schedule && event.schedule.startDateTime) {
      event.schedule.startDateTime = convertUtcToTimezone(
        event.schedule.startDateTime,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }
    if (event.schedule && event.schedule.endDateTime) {
      event.schedule.endDateTime = convertUtcToTimezone(
        event.schedule.endDateTime,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_details_fetched_successfully",
      data: event,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
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
      error: error.message,
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
