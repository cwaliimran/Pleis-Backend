const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const tagsService = require("./tagsService");

const createTag = async (req, res) => {
  const { title, status = "active", type } = req.body;

  if (!validateParams(req, res, { rawData: ["title", "type"] })) return;

  try {
    const tag = await tagsService.createTag({
      title,
      status,
      type,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "tag_created_successfully",
      data: tag,
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

const getTags = async (req, res) => {
  let { page, limit } = parsePaginationParams(req);
  if (req.query.limit >= 100) limit = 1000; // set a maximum limit to prevent abuse
  const { keyword, type, status, date, sortBy, sortOrder } = req.query;

  try {
    const SORT_FIELDS = ["title", "createdAt","tagTitle"];
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

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { tags, meta } = await tagsService.getTags({
      page,
      limit,
      keyword,
      type,
      status,
      date,
      sortBy,
      sortOrder,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tags_fetched_successfully",
      data: tags,
      meta: {
        ...generateMeta(page, limit, meta.total),
        tagsCount: meta.tagsCount,
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

const getPublicTags = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;
  try {
    const { tags, meta } = await tagsService.getPublicTags({
      page,
      limit,
      keyword,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tags_fetched_successfully",
      data: tags,
      meta
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

const updateTag = async (req, res) => {
  const { id } = req.params;
  const { title, status, type } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await tagsService.updateTag(id, {
      title,
      status,
      type,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "tag_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tag_updated_successfully",
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

const deleteTag = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await tagsService.deleteTag(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "tag_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tag_deleted_successfully",
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

module.exports = {
  createTag,
  getTags,
  getPublicTags,
  updateTag,
  deleteTag,
};
