const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const ServingService = require("./servingService");

const createServing = async (req, res) => {
  let { code, status = "active", level2, type, unit } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "level2", "type", "unit"],
    })
  )
    return;
  const alloweUnitValues = ["g", "l", "pcs"];
  if (!alloweUnitValues.includes(unit)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_unit_value",
    });
  }
  const allowedLevel2Values = ["none", "food", "drink"];
  if (!allowedLevel2Values.includes(level2)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_level2_value",
    });
  }
  let data = {
    user,
    code,
    status,
    level2,
    type,
    unit,
  };
  try {
    const Serving = await ServingService.createServing(data);
    if (!Serving) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Serving_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Serving_created_successfully",
      data: Serving,
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
const getServings = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder, summary } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = [
      "code",
      "level2",
      "type",
      "unit",
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
    const { Servings, meta } = await ServingService.getServings({
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
      translationKey: "Servings_fetched_successfully",
      data: Servings,
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
const updateServing = async (req, res) => {
  const { id } = req.params;
  let { level2, type, unit, status } = req.body;
  const allowedUnitValues = ["g", "l", "pcs"];
  if (unit && !allowedUnitValues.includes(unit)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_unit_value",
    });
  }
  const allowedLevel2Values = ["none", "food", "drink"];
  if (level2 && !allowedLevel2Values.includes(level2)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_level2_value",
    });
  }

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    level2,
    type,
    unit,
    status,
  };

  try {
    const updated = await ServingService.updateServing(id, data);
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
        translationKey: "Serving_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Serving_updated_successfully",
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

const deleteServing = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await ServingService.deleteServing(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Serving_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Serving_deleted_successfully",
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
const getServingCode = async (req, res) => {
  try {
    const code = await ServingService.getServingCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Serving_code_fetched_successfully",
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
  createServing,
  getServings,
  updateServing,
  deleteServing,
  getServingCode,
};
