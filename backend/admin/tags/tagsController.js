const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../helperUtils/responseUtil");

const tagsService = require("./tagsService");

const createTag = async (req, res) => {
  const { title, description, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const tag = await tagsService.createTag({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "tag_created_successfully",
      data: tag,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.code === 11000 ? 400 : 500,
      translationKey:
        error.code === 11000
          ? "tag_title_unique_violation"
          : "internal_server",
      error: error.message,
    });
  }
};

const getTags = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;

  try {
    const { tags, meta } = await tagsService.getTags({
      page,
      limit,
      keyword,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tags_fetched_successfully",
      data: tags,
      meta: generateMeta(page, limit, meta.total, meta.tagsCount),
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

const updateTag = async (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;

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
      description,
      ...(status !== undefined && { status }),
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
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error: error.message,
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
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
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
