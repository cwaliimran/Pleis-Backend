const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const menuItemsComboService = require("./menuItemsCombosService");
const { default: mongoose } = require("mongoose");
const { PriceMode } = require("@MenuItemsCombosModel");

const validatePriceByMode = (res, priceMode, price) => {
  const numericPrice = Number(price);

  if (Number.isNaN(numericPrice) || numericPrice < 0) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_price_value",
    });
    return false;
  }

  if (
    priceMode === PriceMode.PERCENTAGE_OFF_SUM &&
    (numericPrice <= 0 || numericPrice > 100)
  ) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_percentage_off_sum_value",
    });
    return false;
  }

  if (
    (priceMode === PriceMode.FIXED_COMBO_PRICE ||
      priceMode === PriceMode.FIXED_AMOUNT_OFF_SUM) &&
    numericPrice < 0
  ) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_fixed_price_value",
    });
    return false;
  }

  return true;
};

const createMenuItemsCombo = async (req, res) => {
  let {
    name,
    subCategory,
    description = "",
    menuItems,
    priceMode = PriceMode.FIXED_COMBO_PRICE,
    price,
    status = "active",
    companyOrganizer,
  } = req.body;

  if (!menuItems || !Array.isArray(menuItems) || menuItems.length < 2) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "combo_items_minimum_required",
    });
  }

  if (
    !validateParams(req, res, {
      rawData: ["name", "subCategory", "price", "priceMode", "companyOrganizer"],
      objectIdFields: ["subCategory", "companyOrganizer"],
      enumFields: {
        priceMode: Object.values(PriceMode),
        status: ["active", "inactive"],
      },
    })
  ) {
    return;
  }

  if (!validatePriceByMode(res, priceMode, price)) {
    return;
  }

  const data = {
    name,
    subCategory,
    description,
    menuItems,
    priceMode,
    price: Number(price),
    status,
    creator: companyOrganizer,
  };

  try {
    const combo = await menuItemsComboService.createMenuItemsCombo(data);
    if (combo && combo.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: combo.error,
      });
    }
    if (!combo) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "menu_items_combo_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_items_combo_created_successfully",
      data: combo,
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

const getMenuItemsCombos = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status,
    subCategory,
    priceMode,
    date,
    sortBy,
    sortOrder,
    companyOrganizer: creator,
  } = req.query;

  const SORT_FIELDS = [
    "name",
    "price",
    "priceMode",
    "subCategory",
    "status",
    "createdAt",
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

  try {
    const { combos, meta } = await menuItemsComboService.getMenuItemsCombos({
      page,
      limit,
      keyword,
      status,
      subCategory,
      priceMode,
      date,
      sortBy,
      sortOrder,
      creator,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_combos_fetched_successfully",
      data: combos,
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

const getMenuItemsComboDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) {
    return;
  }

  try {
    const combo = await menuItemsComboService.getMenuItemsComboDetails(id);
    if (!combo) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_items_combo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_combo_details_fetched_successfully",
      data: combo,
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

const updateMenuItemsCombo = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    subCategory,
    description,
    menuItems,
    priceMode,
    price,
    status,
  } = req.body;
if (menuItems !== undefined) {
  const isValidMenuItems =
    Array.isArray(menuItems) &&
    menuItems.length >= 2 &&
    menuItems.every(
      (item) =>
        item &&
        typeof item === "object" &&
        mongoose.Types.ObjectId.isValid(item.menuItem) &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 1,
    );

  if (!isValidMenuItems) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "combo_items_minimum_required",
    });
  }
}
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id", "subCategory"],
      enumFields: {
        priceMode: Object.values(PriceMode),
        status: ["active", "inactive", "deleted"],
      },
    })
  ) {
    return;
  }

  const data = {
    name,
    subCategory,
    description,
    menuItems,
    priceMode,
    price: price !== undefined ? Number(price) : undefined,
    status,
  };

  try {
    if (priceMode !== undefined || price !== undefined) {
      // Resolve final mode/price for validation when only one field is sent
      const finalPriceMode = priceMode;
      const finalPrice = price;
      if (finalPriceMode !== undefined && finalPrice !== undefined) {
        if (!validatePriceByMode(res, finalPriceMode, finalPrice)) {
          return;
        }
      } else if (finalPrice !== undefined && Number(finalPrice) < 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_price_value",
        });
      }
    }

    const updated = await menuItemsComboService.updateMenuItemsCombo(
      new mongoose.Types.ObjectId(id),
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
        translationKey: "menu_items_combo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_combo_updated_successfully",
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

const deleteMenuItemsCombo = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) {
    return;
  }

  try {
    const deleted = await menuItemsComboService.deleteMenuItemsCombo(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_items_combo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_combo_deleted_successfully",
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
  createMenuItemsCombo,
  getMenuItemsCombos,
  getMenuItemsComboDetails,
  updateMenuItemsCombo,
  deleteMenuItemsCombo,
};
