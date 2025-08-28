const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const tagsService = require("./tagsService");

const createTag = async (req, res) => {
  const { title, status = "active", pinned = false } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const tag = await tagsService.createTag({
      title,
      status: "active",
      type: "primary",
      pinned: false,
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
  const { page, limit } = parsePaginationParams(req);
  const { keyword, type, status, pinned, date } = req.query;

  try {

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
      pinned, date
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
  const { title, status, pinned, type } = req.body;

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
      pinned,
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
