const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertUtcToTimezone,
} = require("../../helperUtils/responseUtil");
const { Highlights } = require("@HighlightsModel");

const highlightService = require("./highlightService");

const createHighlight = async (req, res) => {
  let { timezone, _id: userId } = req.user;

  const {
    media = {
      name: "",
      type: "video", // Ensure 'video' as default
    },
    title = "",
    type = "event",
    object,
    status = "active",
  } = req.body;

  // Validation setup
  let validateData = {
    rawData: [
      "title",
      "type",
      "object",
    ],
    enumFields: {
      "type": ["event", "organization"],
      "status": ["active", "inactive"],
    },
    objectIdFields: ["object"],
  };

  if (!validateParams(req, res, validateData)) return;

  // Construct highlight data per schema
  const highlightData = {
    media: {
      name: media.name || "",
      type: media.type || "video",
    },
    title: title.trim(),
    type,
    object,
    creator: userId,
    status,
  };

  try {

    //according to type validate if object is valid
    if (type === "event") {
      const event = await highlightService.validateEvent(object);
      if (!event) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "event_not_found",
        });
      }
    } else if (type === "organization") {
      const organization = await highlightService.validateOrganization(object);
      if (!organization) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "organization_not_found",
        });
      }
    }

    const highlight = await highlightService.createHighlight({ data: highlightData });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "highlight_created_successfully",
      data: highlight,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError,
      error,
    });
  }
};

const getHighlights = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder } = req.query;
  let { _id, timezone } = req.user;
  const SORT_FIELDS = ["title", "createdAt", "organizationName", "eventName"];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy)
      ? "invalid_sort_by_field"
      : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }
  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    let { highlights, meta } = await highlightService.getHighlights({
      page,
      limit,
      keyword,
      status,
      creator: _id,
      date,
      sortBy,
      sortOrder,
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "highlights_fetched_successfully",
      data: highlights,
      meta: generateMeta(page, limit, meta.total),
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

const getPublicHighlights = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { highlights, meta } =
      await highlightService.getPublicHighlights({
        page,
        limit,
        keyword,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_highlights_fetched_successfully",
      data: highlights,
      meta: generateMeta(page, limit, meta.total),
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

const updateHighlight = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    media,
    title,
    type,
    object,
    status,
  } = req.body);

  // Only add fields to validateData if present in req.body
  let validateData = {
    rawData: [],
    enumFields: {},
    objectIdFields: [],
  };

  if ("media" in req.body) validateData.rawData.push("media");
  if ("title" in req.body) validateData.rawData.push("title");
  if ("type" in req.body) {
    validateData.rawData.push("type");
    validateData.enumFields["type"] = ["event", "organization"];
  }
  if ("object" in req.body) {
    validateData.rawData.push("object");
    validateData.objectIdFields.push("object");
  }
  if ("status" in req.body) {
    validateData.rawData.push("status");
    validateData.enumFields["status"] = ["active", "inactive"];
  }
  if (!validateParams(req, res, validateData)) return;

  // check if event/organization exists only if type is present in req.body
  if ("type" in req.body || "object" in req.body) {
    if (type === "event") {
      const event = await highlightService.validateEvent(object);
      if (!event) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "event_not_found",
        });
      }
    } else if (type === "organization") {
      const organization = await highlightService.validateOrganization(object);
      if (!organization) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "organization_not_found",
        });
      }
    }
  }

  try {
    const updated = await highlightService.updateHighlight(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "highlight_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "highlight_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableerror,
      error,
    });
  }
};

const deleteHighlight = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await highlightService.deleteHighlight(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "highlight_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "highlight_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

const getHighlightDetails = async (req, res) => {
  const { id } = req.params;
  let { timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    let highlight = await highlightService.getHighlightDetails(id);
    if (!highlight) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "highlight_not_found",
      });
    }
    // Convert highlight to JSON for adjustments
    highlight = new Highlights(highlight).toCustomJSON(highlight);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "highlight_details_fetched_successfully",
      data: highlight,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

module.exports = {
  createHighlight,
  getHighlights,
  getPublicHighlights,
  updateHighlight,
  deleteHighlight,
  getHighlightDetails,
};
