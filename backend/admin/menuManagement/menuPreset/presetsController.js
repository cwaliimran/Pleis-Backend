
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const presetsService = require("./presetsService");

const createPreset = async (req, res) => {
  const {
    image,
    category,
    title,
    description = "",
    basePrice = "0",
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title"],
    })
  )
    return;

  let data = {
    image,
    title,
    category,
    description,
    basePrice,
    status,
  };

  try {
    const preset = await presetsService.createPreset(data);
    if (!preset) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "preset_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "preset_created_successfully",
      data: preset,
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

const getPresets = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, sortBy, sortOrder } = req.query;
  try {

    const SORT_FIELDS = ["name", "createdAt", "description"];
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

    const { presets, meta } = await presetsService.getPresets({
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
      translationKey: "presets_fetched_successfully",
      data: presets,
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

const getPresetDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const preset = await presetsService.getPresetDetails(id);
    if (!preset) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "preset_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "preset_details_fetched_successfully",
      data: preset,
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

const updatePreset = async (req, res) => {
  const { id } = req.params;
  const {
    image,
    title,
    description,
    basePrice,
    category,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    image,
    title,
    description,
    basePrice,
    category,
    status,
  };

  try {
    const updated = await presetsService.updatePreset(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "preset_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "preset_updated_successfully",
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

const deletePreset = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await presetsService.deletePreset(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "preset_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "preset_deleted_successfully",
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
  createPreset,
  getPresets,
  updatePreset,
  deletePreset,
  getPresetDetails,
};
