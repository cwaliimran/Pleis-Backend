const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment-timezone");

const MenuItemSubCategoryService = require("./menuItemSubCategoriesService");

const createMenuItemSubCategory = async (req, res) => {
  let { status = "active", name, category, order = 0 } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["category", "status", "name"],
    })
  )
    return;
  let data = {
    user,
    category,
    status,
    name,
    order,
  };
  try {
    const MenuItemSubCategory =
      await MenuItemSubCategoryService.createMenuItemSubCategory(data);
    if (!MenuItemSubCategory) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "MenuItemSubCategory_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "MenuItemSubCategory_created_successfully",
      data: MenuItemSubCategory,
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
const getMenuItemSubCategorys = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  const { keyword, status, date, sortBy="name", sortOrder="asc", summary, category } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = ["name", "category", "createdAt", "status", "order"];
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
    const { MenuItemSubCategorys, meta } =
      await MenuItemSubCategoryService.getMenuItemSubCategorys({
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
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategorys_fetched_successfully",
      data: MenuItemSubCategorys,
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
const updateMenuItemSubCategory = async (req, res) => {
  const { id } = req.params;
  let { name, status, category, order } = req.body;

  if (order !== undefined && order !== null && order !== "") {
    order = Number(order);
    if (!Number.isFinite(order)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_order",
      });
    }
  } else {
    order = undefined;
  }

  let data = {
    name,
    status,
    category,
    order,
  };

  try {
    const updated = await MenuItemSubCategoryService.updateMenuItemSubCategory(
      id,
      data,
    );
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
        translationKey: "MenuItemSubCategory_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategory_updated_successfully",
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

const deleteMenuItemSubCategory = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted =
      await MenuItemSubCategoryService.deleteMenuItemSubCategory(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuItemSubCategory_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategory_deleted_successfully",
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
const getMenuItemSubCategoryCode = async (req, res) => {
  try {
    const code = await MenuItemSubCategoryService.getMenuItemSubCategoryCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategory_code_fetched_successfully",
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
const reorderMenuItemSubCategory = async (req, res) => {
  const { id } = req.params;
  const { newOrder } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      rawData: ["newOrder"],
    })
  )
    return;
  const targetOrder = Number(newOrder);
  if (!Number.isFinite(targetOrder)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_order",
    });
  }

  try {
    const reordered =
      await MenuItemSubCategoryService.reorderMenuItemSubCategory(
        id,
        targetOrder,
      );
    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuItemSubCategory_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategory_reordered_successfully",
      data: reordered,
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
  createMenuItemSubCategory,
  getMenuItemSubCategorys,
  updateMenuItemSubCategory,
  deleteMenuItemSubCategory,
  getMenuItemSubCategoryCode,
  reorderMenuItemSubCategory,
};
