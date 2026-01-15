const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  isValidNanoid,
  getStartAndEndOfWeek,
  getCurrentDateInTimezone,
} = require("../../helperUtils/responseUtil");
const eventService = require("./eventService");

const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, filter = "", startDate, endDate, organization } = req.query;
  let { timezone } = req.user;
  const now = new Date();
  const nowInTz = getCurrentDateInTimezone({ timezone });

  try {

    if (!validateParams(req, res, {
      queryParams: ["organization"],
    })) return;

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

    if (filter === "thisWeek") {
      const { start, end } = getStartAndEndOfWeek(now, timezone);
      startDate = start;
      endDate = end;
    } else if (filter === "past") {
      endDate = nowInTz;

    } else if (filter === "active") {
      startDate = nowInTz;
    }


    let { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      startDate,
      endDate,
      organization,
      timezone,
      filter,
      nowInTz
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

const getEventDetails = async (req, res) => {
  let { id: eventId } = req.params;
  let { timezone } = req.user;
  const { ticketId } = req.body;
  // Accept both nanoid and ObjectId for event id
  if (
    (!validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    }))
  ) return;

  try {
    let data = await eventService.getEventDetails(eventId, timezone, ticketId);
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

const getEventAttendees = async (req, res) => {
  let { id } = req.params;
  const { page, limit, skip } = parsePaginationParams(req);
  let { keyword = "" } = req.query;

  // Accept both nanoid and ObjectId for event id
  if (
    (!validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    }))
  ) return;

  try {
    let { attendees, meta } = await eventService.getEventAttendeesService(id, keyword, page, limit, skip);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_attendees_fetched_successfully",
      data: attendees,
      meta,
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

const checkInEventAttendee = async (req, res) => {
  const { id, ticketBookingId } = req.params;
  const scannedBy = req.user._id;

  if (
    !validateParams(req, res, {
      pathParams: ["id", "ticketBookingId"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    const result = await eventService.checkInEventAttendeeService(
      id,
      ticketBookingId,
      scannedBy
    );

    if (!result || !result.success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result?.error || "event_or_ticket_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_attendee_checked_in_successfully",
      data: result.attendee,
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
  getEvents,
  getEventDetails,
  getEventAttendees,
  checkInEventAttendee
};
