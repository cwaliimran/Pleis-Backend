const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const pinnedContentService = require("./pinnedContentService");

const createPinnedContent = async (req, res) => {
  const { status = "active", filterType, filter, contentType } = req.body;

  if (!validateParams(req, res, { rawData: ["filterType", "filter", "contentType"], enumFields: { filterType: ["Categories", "Tags", "VenueTypes"], contentType: ["Event", "Organizations", "Categories"] } })) return;

  try {

    // Validate if the pinned content already exists

    const existing = await pinnedContentService.countItemsByFilter({ filter, status: { $ne: "deleted" } });
    if (existing) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: "pinned_content_already_exists",
      });
    }

    const pinnedContent = await pinnedContentService.createPinnedContent({
      status,
      filterType,
      filter,
      contentType,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "pinned_content_created_successfully",
      data: pinnedContent,
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

const getPinnedContent = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { pinnedContent, meta } = await pinnedContentService.getPinnedContent({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pinned_content_fetched_successfully",
      data: pinnedContent,
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

const updatePinnedContent = async (req, res) => {
  const { id } = req.params;
  const { status, filterType, filter, contentType, content } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await pinnedContentService.updatePinnedContent(id, {
      status,
      filterType,
      filter,
      contentType,
      content,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "pinned_content_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pinned_content_updated_successfully",
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

const deletePinnedContent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await pinnedContentService.deletePinnedContent(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "pinned_content_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pinned_content_deleted_successfully",
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

const reorderPinnedContent = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await pinnedContentService.reorderPinnedContent(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "pinned_content_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pinned_content_reordered_successfully",
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
  createPinnedContent,
  getPinnedContent,
  updatePinnedContent,
  deletePinnedContent,
  reorderPinnedContent,
};