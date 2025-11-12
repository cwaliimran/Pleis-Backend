const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const statusBadgesService = require("./statusBadgesService");

const createStatusBadge = async (req, res) => {
  const { image, backgroundImage, title, status = "active", entryPoints = 0, retainPoints = 0, order = 0 } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const statusBadge = await statusBadgesService.createStatusBadge({
      image,
      backgroundImage,
      title,
      status,
      entryPoints,
      retainPoints,
      order,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "status_badge_created_successfully",
      data: statusBadge,
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

const getStatusBadges = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { statusBadges, meta } = await statusBadgesService.getStatusBadges({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_badges_fetched_successfully",
      data: statusBadges,
      meta
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

const updateStatusBadge = async (req, res) => {
  const { id } = req.params;
  const { title, status, image, backgroundImage, entryPoints, retainPoints, order } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await statusBadgesService.updateStatusBadge(id, {
      title,
      status,
      image,
      backgroundImage,
      entryPoints,
      retainPoints,
      order,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_badge_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_badge_updated_successfully",
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

const deleteStatusBadge = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await statusBadgesService.deleteStatusBadge(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_badge_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_badge_deleted_successfully",
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

const reorderStatusBadge = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await statusBadgesService.reorderStatusBadge(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "status_badge_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_badge_reordered_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error
    });
  }
};

module.exports = {
  createStatusBadge,
  getStatusBadges,
  updateStatusBadge,
  deleteStatusBadge,
  reorderStatusBadge,
};