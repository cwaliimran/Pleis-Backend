const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const TagstypesService = require("./tagTypesService");

const createTagsType = async (req, res) => {
  const { title, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const Tagstype = await TagstypesService.createTagsType({
      title,
      status: "active",
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Tags_type_created_successfully",
      data: Tagstype,
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

const getTagsTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, sortBy, sortOrder } = req.query;

  try {
    const SORT_FIELDS = ["title", "createdAt"];
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


    const { TagsTypes, meta } = await TagstypesService.getTagsTypes({
      page,
      limit,
      keyword,
      status,
      date,
      sortBy,
      sortOrder,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Tags_types_fetched_successfully",
      data: TagsTypes,
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

const getPublicTagsTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date } = req.query;
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const { tagsTypes, meta } = await TagstypesService.getPublicTagsTypes({ page, limit, keyword });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Tags_types_fetched_successfully",
      data: tagsTypes,
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

const updateTagsType = async (req, res) => {
  const { id } = req.params;
  const { title, status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await TagstypesService.updateTagsType(id, {
      title,
      status,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Tags_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Tags_type_updated_successfully",
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

const deleteTagsType = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await TagstypesService.deleteTagsType(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Tags_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Tags_type_deleted_successfully",
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
  createTagsType,
  getTagsTypes,
  getPublicTagsTypes,
  updateTagsType,
  deleteTagsType,
};
