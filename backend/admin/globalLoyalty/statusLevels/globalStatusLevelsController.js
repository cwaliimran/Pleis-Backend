const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const statusLevelsService = require("./globalStatusLevelsService");

const createStatusLevel = async (req, res) => {
  const {
    image,
    title,
    bonusPointsPerEuro,
    type,
    entryPoints,
    retainPoints,
    status = "active",
    backgroundImage,
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title", "bonusPointsPerEuro", "type", "entryPoints", "retainPoints"],
    })
  )
    return;

  let data = {
    image,
    title,
    bonusPointsPerEuro,
    type,
    entryPoints,
    retainPoints,
    status,
    backgroundImage
  };

  try {
    const statusLevel = await statusLevelsService.createStatusLevel(data);
    if (!statusLevel) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "status_level_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "status_level_created_successfully",
      data: statusLevel,
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

const getStatusLevels = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, sortBy, sortOrder } = req.query;
  try {
    const SORT_FIELDS = ["title", "entryPoints", "retainPoints"];
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
    const { statusLevels, meta } = await statusLevelsService.getStatusLevels({
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
      translationKey: "status_levels_fetched_successfully",
      data: statusLevels,
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

const getStatusLevelDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const statusLevel = await statusLevelsService.getStatusLevelDetails(id);
    if (!statusLevel) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_level_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_level_details_fetched_successfully",
      data: statusLevel,
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

const updateStatusLevel = async (req, res) => {
  const { id } = req.params;
  const {
    image,
    title,
    bonusPointsPerEuro,
    type,
    entryPoints,
    retainPoints,
    status = "active",
    backgroundImage,
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
    bonusPointsPerEuro,
    type,
    entryPoints,
    retainPoints,
    status,
    backgroundImage,
  };

  try {
    const updated = await statusLevelsService.updateStatusLevel(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_level_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_level_updated_successfully",
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

const deleteStatusLevel = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await statusLevelsService.deleteStatusLevel(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_level_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_level_deleted_successfully",
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
const getTitleStatusLevels = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date } = req.query;
  try {
    const { statusLevels, meta } = await statusLevelsService.getTitleStatusLevels({
      page,
      limit,
      keyword,
      status,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_levels_fetched_successfully",
      data: statusLevels,
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
module.exports = {
  createStatusLevel,
  getStatusLevels,
  updateStatusLevel,
  deleteStatusLevel,
  getStatusLevelDetails,
  getTitleStatusLevels
};