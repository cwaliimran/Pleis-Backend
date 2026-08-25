const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment-timezone");

const MenuItemSubCategoryTypeService = require("./menuItemSubCategoryTypeService");

const createMenuItemSubCategoryType = async (req, res) => {
  let { status = "active", name, subCategory} = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["subCategory", "status", "name"],
    })
  )
    return;
  let data = {
    user,
    subCategory,
    status,
    name,
  };
  try {
    const MenuItemSubCategoryType =
      await MenuItemSubCategoryTypeService.createMenuItemSubCategoryType(data);
    if (!MenuItemSubCategoryType) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "MenuItemSubCategoryType_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "MenuItemSubCategoryType_created_successfully",
      data: MenuItemSubCategoryType,
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
const getMenuItemSubCategoryTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  const { keyword, status, date, sortBy="name", sortOrder="asc", summary, subCategory } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = ["name", "subCategory", "createdAt", "status"];
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
    const { MenuItemSubCategoryTypes, meta } =
      await MenuItemSubCategoryTypeService.getMenuItemSubCategoryTypes({
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
        subCategory,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategoryTypes_fetched_successfully",
      data: MenuItemSubCategoryTypes,
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
const updateMenuItemSubCategoryType = async (req, res) => {
  const { id } = req.params;
  let { name, status, subCategory, order } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    status,
    subCategory,
    order,
  };

  try {
    const updated = await MenuItemSubCategoryTypeService.updateMenuItemSubCategoryType(
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
        translationKey: "MenuItemSubCategoryType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategoryType_updated_successfully",
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

const deleteMenuItemSubCategoryType = async (req, res) => {
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
      await MenuItemSubCategoryTypeService.deleteMenuItemSubCategoryType(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuItemSubCategoryType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategoryType_deleted_successfully",
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
const getMenuItemSubCategoryTypeCode = async (req, res) => {
  try {
    const code = await MenuItemSubCategoryTypeService.getMenuItemSubCategoryTypeCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategoryType_code_fetched_successfully",
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
const reorderMenuItemSubCategoryType = async (req, res) => {
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
  const user = req.user._id;
  try {
    const reordered =
      await MenuItemSubCategoryTypeService.reorderMenuItemSubCategoryType(
        id,
        newOrder,
        user,
      );
    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuItemSubCategoryType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuItemSubCategoryType_reordered_successfully",
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
  createMenuItemSubCategoryType,
  getMenuItemSubCategoryTypes,
  updateMenuItemSubCategoryType,
  deleteMenuItemSubCategoryType,
  getMenuItemSubCategoryTypeCode,
  reorderMenuItemSubCategoryType,
};
