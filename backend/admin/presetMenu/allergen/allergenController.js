const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const AllergenService = require("./allergenService");

const createAllergen = async (req, res) => {
  let { code, status = "active", name } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "name"],
    })
  )
    return;
  let data = {
    user,
    code,
    status,
    name,

  };
  try {
    const Allergen = await AllergenService.createAllergen(data);
    if (!Allergen) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Allergen_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Allergen_created_successfully",
      data: Allergen,
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
const getAllergens = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder, summary } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = [
      "code",
      "name",
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
    const { Allergens, meta } = await AllergenService.getAllergens({
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
      translationKey: "Allergens_fetched_successfully",
      data: Allergens,
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
const updateAllergen = async (req, res) => {
  const { id } = req.params;
  let { name, status } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    status,
  };

  try {
    const updated = await AllergenService.updateAllergen(id, data);
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
        translationKey: "Allergen_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Allergen_updated_successfully",
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

const deleteAllergen = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await AllergenService.deleteAllergen(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Allergen_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Allergen_deleted_successfully",
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
const getAllergenCode = async (req, res) => {
  try {
    const code = await AllergenService.getAllergenCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Allergen_code_fetched_successfully",
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
  createAllergen,
  getAllergens,
  updateAllergen,
  deleteAllergen,
  getAllergenCode,
};
