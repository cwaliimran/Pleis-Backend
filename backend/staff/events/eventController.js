const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  isValidNanoid,
  getStartAndEndOfWeek,
} = require("../../helperUtils/responseUtil");
const eventService = require("./eventService");


const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, filter = "", startDate, endDate, organization } = req.query;
  let status = "active";
  let { timezone } = req.user;
  const now = new Date();
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
      const prev = getStartAndEndOfWeek(
        moment(now).subtract(1, "week"),
        timezone
      );
      startDate = prev.start;
      endDate = prev.end;
    }

    let { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      status,
      startDate,
      endDate,
      organization,
      timezone,
      filter,
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

module.exports = {
  getEvents,
  getEventDetails,
};
