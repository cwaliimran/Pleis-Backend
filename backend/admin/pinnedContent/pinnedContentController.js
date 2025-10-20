const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const pinnedContentService = require("./pinnedContentService");

const createPinnedContent = async (req, res) => {
  const { status = "active", type, object } = req.body;

  if (!validateParams(req, res, { rawData: ["type", "object"], enumFields: { type: ["categories", "tags", "venues"] } })) return;

  try {
    const pinnedContent = await pinnedContentService.createPinnedContent({
      status,
      type,
      object,
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

    const populatedPinnedContent = await Promise.all(pinnedContent.map(async (content) => {
      return await content.populate('object');
    }));

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pinned_content_fetched_successfully",
      data: populatedPinnedContent,
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
};

const updatePinnedContent = async (req, res) => {
  const { id } = req.params;
  const { status, type, object } = req.body;

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
      type,
      object,
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