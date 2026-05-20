const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const menusService = require("./menusService");

const createMenu = async (req, res) => {
  const {
    title,
    description = "",
    organization,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title"],
      objectIdFields: ["organization"],
    })
  )
    return;

  let data = {
    title,
    description,
    organization,
    status,
    creator: req.user._id,
  };

  //convert organization to array if it's not
  data.organization = [data.organization];

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
  const { keyword, status = "active", organization, date, companyOrganizer, sortBy, sortOrder } = req.query;

  const userId = req.user._id;
  const SORT_FIELDS = ["title", "createdAt", "organizationName","description"];
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

  try {
    const { menus, meta } = await menusService.getMenus({
      page,
      limit,
      keyword,
      status,
      organization,
      userId,
      date,
      sortBy,
      sortOrder
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
    organization,
    status = "active",
    isOrderingEnabled
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id", "organization"],
    })
  )
    return;

  let data = {
    title,
    description,
    organization,
    isOrderingEnabled,
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
const duplicateMenuAndItems = async (req, res) => {
  const { id: menu } = req.params;
  const { organization } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["organization"],
      pathParams: ["id"],
      objectIdFields: ["id", "organization"],
    })
  )
    return;
  try {
    const duplicatedMenu = await menusService.duplicateMenuAndItems(menu, organization);
    if (!duplicatedMenu) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_duplicated_successfully",
      data: duplicatedMenu,
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
}

module.exports = {
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  getMenuDetails,
  duplicateMenuAndItems
};
