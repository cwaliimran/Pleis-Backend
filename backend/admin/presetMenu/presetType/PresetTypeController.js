const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const presetTypeService = require("./PresetTypeService");

const createpresetType = async (req, res) => {
  let { code, status = "active", name, description,category,subCategory,type,example,image } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "name", "description","category","subCategory","type"],
    })
  )
    return;
  let data = {
    user,
    code,
    status,
    name,
    description,
    category,
    subCategory,
    type,
    example,
    image
  };
  try {
    const presetType = await presetTypeService.createpresetType(data);
    if (presetType && presetType.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: presetType.error,
      });
    }
    if (!presetType) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "presetType_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "presetType_created_successfully",
      data: presetType,
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
const getpresetTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder, summary,category,subCategory,type } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = [
      "code",
      "name",
      "description",
      "category",
      "subCategory",
      "type",
      "example",
      "createdAt",
      "status",
    ];
    const SORT_ORDERS = ["asc", "desc"];
    if (
      (sortBy && !SORT_FIELDS.includes(sortBy)) ||
      (sortOrder && !SORT_ORDERS.includes(sortOrder))
    ) {
      const key =
        sortBy && !SORT_FIELDS.includes(sortBy)
          ? "invalid_sort_by_field"
          : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy
        ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }
    const { presetTypes, meta } = await presetTypeService.getpresetTypes({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      date,
      sortBy,
      sortOrder,
      summary,
      category,
      subCategory,
      type,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "presetTypes_fetched_successfully",
      data: presetTypes,
      meta,
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
const updatepresetType = async (req, res) => {
  const { id } = req.params;
  let { name, description, status, example, category, subCategory, type,image } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    description,
    status,
    example,
    category,
    subCategory,
    type,
  };

  try {
    const updated = await presetTypeService.updatepresetType(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "presetType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "presetType_updated_successfully",
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

const deletepresetType = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await presetTypeService.deletepresetType(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "presetType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "presetType_deleted_successfully",
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
const getpresetTypeCode = async (req, res) => {
  try {
    const code = await presetTypeService.getpresetTypeCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "presetType_code_fetched_successfully",
      data: { code },
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
  createpresetType,
  getpresetTypes,
  updatepresetType,
  deletepresetType,
  getpresetTypeCode,
};
