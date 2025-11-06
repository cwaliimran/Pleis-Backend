const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const bannerControlsService = require("./bannerControlsService");

const createBannerControls = async (req, res) => {
  const { status = "active", type, object, title, image } = req.body;

  if (!validateParams(req, res, { rawData: ["type", "object"], enumFields: { type: ["Organizer", "Event", "LoyaltyProgram", "Other"] } })) return;

  try {
    const existing = await bannerControlsService.countItemsByFilter({ object, status: { $ne: "deleted" } });
    if (existing) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: "banner_controls_already_exists",
      });
    }

    const bannerControls = await bannerControlsService.createBannerControls({
      status,
      type,
      object,
      title,
      image,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "banner_controls_created_successfully",
      data: bannerControls,
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

const getBannerControls = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { bannerControls, meta } = await bannerControlsService.getBannerControls({
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
      translationKey: "banner_controls_fetched_successfully",
      data: bannerControls,
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

const updateBannerControls = async (req, res) => {
  const { id } = req.params;
  const { status, type, object } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await bannerControlsService.updateBannerControls(id, {
      status,
      type,
      object,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "banner_controls_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "banner_controls_updated_successfully",
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

const deleteBannerControls = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await bannerControlsService.deleteBannerControls(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "banner_controls_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "banner_controls_deleted_successfully",
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

const reorderBannerControls = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await bannerControlsService.reorderBannerControls(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "banner_controls_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "banner_controls_reordered_successfully",
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
  createBannerControls,
  getBannerControls,
  updateBannerControls,
  deleteBannerControls,
  reorderBannerControls,
};