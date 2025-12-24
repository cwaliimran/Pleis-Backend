const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const popularEventsService = require("./popularEventsService");

const createPopularEvent = async (req, res) => {
  const { event, status = "active", isTop10 } = req.body;

  if (!validateParams(req, res, { rawData: ["event"], objectIdFields: ["event"] })) return;

  try {
    const popularEvent = await popularEventsService.createPopularEvent({
      event,
      isTop10,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "popular_event_created_successfully",
      data: popularEvent,
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

const getPopularEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { popularEvents, meta } = await popularEventsService.getPopularEvents({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    const populatedPopularEvents = await Promise.all(popularEvents.map(async (promo) => {
      return await promo.populate('event');
    }));

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "popular_events_fetched_successfully",
      data: populatedPopularEvents,
      meta: {
        ...generateMeta(page, limit, meta.total),
        popularEventsCount: meta.popularEventsCount,
      },
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


const updatePopularEvent = async (req, res) => {
  const { id } = req.params;
  const { event, isTop10, status, order } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await popularEventsService.updatePopularEvent(id, {
      event,
      isTop10,
      status,
      order,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "popular_event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "popular_event_updated_successfully",
      data: updated,
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

const deletePopularEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await popularEventsService.deletePopularEvent(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "popular_event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "popular_event_deleted_successfully",
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

const reorderPopularEvent = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await popularEventsService.reorderPopularEvent(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "popular_event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "popular_event_reordered_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error
    });
  }
};

module.exports = {
  createPopularEvent,
  getPopularEvents,
  updatePopularEvent,
  deletePopularEvent,
  reorderPopularEvent,
};