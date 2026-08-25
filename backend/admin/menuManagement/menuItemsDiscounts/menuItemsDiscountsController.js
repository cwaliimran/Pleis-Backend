const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const menuItemsDiscountService = require("./menuItemsDiscountsService");
const { default: mongoose } = require("mongoose");

const DATE_FORMAT = "YYYY-MM-DD hh:mm A";

const createMenuItemsDiscount = async (req, res) => {
  const { timezone } = req.user;
  let {
    name,
    type,
    value,
    menuItems,
    startDate,
    endDate,
    status = "active",
    companyOrganizer,
  } = req.body;

  if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "menu_items_required_for_discount",
    });
  }

  if (
    !validateParams(req, res, {
      rawData: ["name", "type", "value", "startDate", "endDate"],
      objectIdFields: ["menuItems", "menu", "companyOrganizer"],
      enumFields: {
        type: ["percentage", "fixed"],
        status: ["active", "inactive", "expired"],
      },
      dateFields: {
        startDate: DATE_FORMAT,
        endDate: DATE_FORMAT,
      },
    })
  ) {
    return;
  }

  const parsedStartDate = new Date(
    convertTimezoneToUtc(startDate, timezone, DATE_FORMAT),
  );
  const parsedEndDate = new Date(
    convertTimezoneToUtc(endDate, timezone, DATE_FORMAT),
  );

  if (parsedEndDate <= parsedStartDate) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "end_date_must_be_after_start_date",
    });
  }

  if (type === "percentage" && (Number(value) <= 0 || Number(value) > 100)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_percentage_discount_value",
    });
  }

  if (type === "fixed" && value < 0) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_fixed_discount_value",
    });
  }

  const data = {
    name,
    type,
    value: Number(value),
    menuItems,
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    status,
    companyOrganizer:
      companyOrganizer ||
      (req.user.userType === "organizer" ? req.user._id : null),
    creator: req.user._id,
  };

  try {
    const discount = await menuItemsDiscountService.createMenuItemsDiscount(
      data,
      timezone,
    );
    if (!discount) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "menu_items_discount_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_items_discount_created_successfully",
      data: discount,
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

const getMenuItemsDiscounts = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status,
    type,
    menu,
    companyOrganizer,
    date,
    sortBy,
    sortOrder,
    startDate,
    endDate,
  } = req.query;

  const SORT_FIELDS = [
    "name",
    "type",
    "value",
    "startDate",
    "endDate",
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

  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }

  try {
    const { discounts, meta } =
      await menuItemsDiscountService.getMenuItemsDiscounts({
        timezone: req.user?.timezone,
        page,
        limit,
        keyword,
        status,
        type,
        menu,
        companyOrganizer,
        date,
        sortBy,
        sortOrder,
        startDate,
        endDate,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_discounts_fetched_successfully",
      data: discounts,
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

const getMenuItemsDiscountDetails = async (req, res) => {
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
    const discount = await menuItemsDiscountService.getMenuItemsDiscountDetails(
      id,
      req.user?.timezone,
    );
    if (!discount) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_items_discount_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_discount_details_fetched_successfully",
      data: discount,
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

const updateMenuItemsDiscount = async (req, res) => {
  const { id } = req.params;
  const { timezone } = req.user;
  let {
    name,
    type,
    value,
    menuItems,
    startDate,
    endDate,
    status,
    companyOrganizer,
  } = req.body;

  if (menuItems !== undefined && (!Array.isArray(menuItems) || menuItems.length === 0)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "menu_items_required_for_discount",
    });
  }

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id", "menuItems", "menu", "companyOrganizer"],
      enumFields: {
        type: ["percentage", "fixed"],
        status: ["active", "inactive", "expired", "deleted"],
      },
      dateFields: {
        startDate: DATE_FORMAT,
        endDate: DATE_FORMAT,
      },
    })
  ) {
    return;
  }

  const data = {
    name,
    type,
    value: value !== undefined ? Number(value) : undefined,
    menuItems,
    status,
    companyOrganizer,
  };

  try {
    if (startDate) {
      data.startDate = new Date(
        convertTimezoneToUtc(startDate, timezone, DATE_FORMAT),
      );
    }

    if (endDate) {
      data.endDate = new Date(
        convertTimezoneToUtc(endDate, timezone, DATE_FORMAT),
      );
    }

    if (data.startDate && data.endDate && data.endDate <= data.startDate) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_date_must_be_after_start_date",
      });
    }

    if (type === "percentage" && value !== undefined && (Number(value) <= 0 || Number(value) > 100)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_percentage_discount_value",
      });
    }

    if (type === "fixed" && value !== undefined && value < 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_fixed_discount_value",
      });
    }

    const updated = await menuItemsDiscountService.updateMenuItemsDiscount(
      new mongoose.Types.ObjectId(id),
      data,
      timezone,
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
        translationKey: "menu_items_discount_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_discount_updated_successfully",
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

const deleteMenuItemsDiscount = async (req, res) => {
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
    const deleted = await menuItemsDiscountService.deleteMenuItemsDiscount(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_items_discount_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_discount_deleted_successfully",
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
  createMenuItemsDiscount,
  getMenuItemsDiscounts,
  getMenuItemsDiscountDetails,
  updateMenuItemsDiscount,
  deleteMenuItemsDiscount,
};
