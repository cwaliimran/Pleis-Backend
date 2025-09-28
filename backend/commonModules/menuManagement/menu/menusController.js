const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const menusService = require("./menusService");

const createMenu = async (req, res) => {
  const {
    title,
    description = "",
    venue,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title"],
      objectIdFields: ["venue"],
    })
  )
    return;

  let data = {
    title,
    description,
    venue,
    status,
    creator: req.user._id,
  };

  try {
    const menu = await menusService.createMenu(data);
    if (!menu) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "menu_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_created_successfully",
      data: menu,
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

const getMenus = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", venue, date } = req.query;
  const userId = req.user._id;
  try {
    const { menus, meta } = await menusService.getMenus({
      page,
      limit,
      keyword,
      status,
      venue,
      userId,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menus_fetched_successfully",
      data: menus,
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

const getMenuDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const menu = await menusService.getMenuDetails(id);
    if (!menu) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_details_fetched_successfully",
      data: menu,
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

const updateMenu = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    venue,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id", "venue"],
    })
  )
    return;

  let data = {
    title,
    description,
    venue,
    status,
  };

  try {
    const updated = await menusService.updateMenu(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_updated_successfully",
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

const deleteMenu = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await menusService.deleteMenu(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_deleted_successfully",
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
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  getMenuDetails,
};
