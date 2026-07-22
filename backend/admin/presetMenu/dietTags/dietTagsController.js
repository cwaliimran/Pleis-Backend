const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const DietTagsService = require("./dietTagsService");

const createDietTags = async (req, res) => {
  let { code, status = "active", name, description } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "name", "description"],
    })
  )
    return;
  let data = {
    user,
    code,
    status,
    name,
    description,
  };
  try {
    const DietTags = await DietTagsService.createDietTags(data);
    if (!DietTags) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "DietTags_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "DietTags_created_successfully",
      data: DietTags,
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
const getDietTagss = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder, summary } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = [
      "code",
      "name",
      "description",
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
    const { DietTagss, meta } = await DietTagsService.getDietTagss({
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
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "DietTagss_fetched_successfully",
      data: DietTagss,
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
const updateDietTags = async (req, res) => {
  const { id } = req.params;
  let { name, description, status } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    description,
    status,
  };

  try {
    const updated = await DietTagsService.updateDietTags(id, data);
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
        translationKey: "DietTags_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "DietTags_updated_successfully",
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

const deleteDietTags = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await DietTagsService.deleteDietTags(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "DietTags_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "DietTags_deleted_successfully",
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
const getDietTagsCode = async (req, res) => {
  try {
    const code = await DietTagsService.getDietTagsCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "DietTags_code_fetched_successfully",
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
  createDietTags,
  getDietTagss,
  updateDietTags,
  deleteDietTags,
  getDietTagsCode,
};
