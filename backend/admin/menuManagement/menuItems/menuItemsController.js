const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const menuItemsService = require("./menuItemsService");
const { default: mongoose } = require("mongoose");

const createMenuItem = async (req, res) => {
  let { timezone } = req.user;
  let {
    image,
    title,
    description = "",
    type,
    subCategory,
    basePrice,
    taxPercent,
    menuIds,
    startTime,
    endTime,
    status = "active",
    companyOrganizer,
    // v2 params
    presetType,
    brand,
    amountQuantity,
    quantityType,
    servingSize,
    availableDays,
    daypart,
    dietTags,
    allergens,
    upSellItem,
    cuisine,
    isRecommended,
    isTogo,
    isRequiresOrderConfirmation,
  } = req.body;

  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }

  if (
    !validateParams(req, res, {
      rawData: ["title", "basePrice", "menuIds"],
      objectIdFields: [
        "menuIds",
        "subCategory",
        "presetType",
        "servingSize",
        "daypart",
        "dietTags",
        "allergens",
      ],
      dateFields: {
        startTime: "hh:mm A", // Example format: 02:30 PM
        endTime: "hh:mm A", // Example format: 02:30 PM
      },
      enumFields: {
        quantityType: ["single", "combo"],
        availableDays: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
    })
  )
    return;

  let data = {
    image,
    title,
    description,
    type,
    subCategory,
    basePrice,
    taxPercent,
    menuIds,
    startTime,
    endTime,
    status,
    creator: companyOrganizer,
    presetType,
    brand,
    amountQuantity,
    quantityType,
    servingSize,
    availableDays,
    daypart,
    dietTags,
    allergens,
    cuisine,
    isRecommended,
    upSellItem,
    isTogo,
    isRequiresOrderConfirmation,
  };

  if (startTime) {
    data.startTime = convertTimezoneToUtc(startTime, timezone, "hh:mm A");
  }

  if (endTime) {
    data.endTime = convertTimezoneToUtc(endTime, timezone, "hh:mm A");
  }

  try {

    const menuItems = await menuItemsService.createMenuItem(data, timezone);
    if (!menuItems) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "menu_item_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_item_created_successfully",
      data: menuItems,
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

//importMenuItems the frontend will pas menuItems as an array of menu items to be created. The service will validate each menu item and create them in bulk. If any menu item fails validation, the entire operation will fail and no menu items will be created. This ensures data integrity and consistency.
const importMenuItems = async (req, res) => {
  const { menu, companyOrganizer, presetItems } = req.body;
  if (!validateParams(req, res, {
    rawData: ["menu", "companyOrganizer", "presetItems"],
    objectIdFields: ["menu", "companyOrganizer"],
  }))
    return;

  let data = {
    menu,
    companyOrganizer,
    presetItems
  };

  try {
    const result = await menuItemsService.importMenuItems(data);
    if (result.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "menu_items_imported_successfully",
      data: result,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  };
}

const getMenuItems = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status = { $ne: "deleted" },
    menu,
    type,
    subCategory,
    startTime,
    endTime,
    date,
    companyOrganizer,
    organization,
    sortBy,
    sortOrder
  } = req.query;
  const SORT_FIELDS = ["menuItemName", "description", "menuName", "price"];
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
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id
  }
  if (!companyOrganizer) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "company_organizer_is_required",
    });


  }
  companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  try {
    const { menuItems, meta } = await menuItemsService.getMenuItems({
      page,
      limit,
      keyword,
      status,
      menu,
      type,
      subCategory,
      startTime,
      endTime,
      timezone: req.user?.timezone,
      date,
      companyOrganizer,
      organization,
      sortBy,
      sortOrder
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: menuItems,
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

const getMenuItemDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const menuItem = await menuItemsService.getMenuItemDetails(id, req.user?.timezone);
    if (!menuItem) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_details_fetched_successfully",
      data: menuItem,
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

const updateMenuItem = async (req, res) => {
  let { id } = req.params;
  let { timezone } = req.user;
  let {
    image,
    title,
    description,
    type,
    subCategory,
    basePrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status = "active",
    isLimitedTimeOffer,
    
    isScheduled,
    startDate,
    endDate,
    isAvailableInStock,
    upSellItem,
    availabilityType,
    event,
    // v2 params
    presetType,
    brand,
    amountQuantity,
    quantityType,
    servingSize,
    availableDays,
    daypart,
    dietTags,
    allergens,
    cuisine,
    isRecommended,
    isTogo,
    isRequiresOrderConfirmation,
  } = req.body;
  if (availabilityType === 'preOrdersEvent' && !event) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "event_is_required_for_preOrdersEvent",

    });
  }

  if (upSellItem) {
    if (upSellItem === "true"|| upSellItem === true) {
      upSellItem = true;
    } else if (upSellItem === "false" || upSellItem === false) {
      upSellItem = false;
    } else {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_upSellItem_value",
      });
    }
  }
  if (isScheduled) {
    if (isScheduled === "true") {
      isScheduled = true;
    } else if (isScheduled === "false") {
      isScheduled = false;
    } else {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_upSellItem_value",
      });
    }
  }

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: [
        "menu",
        "subCategory",
        "presetType",
        "brand",
        "servingSize",
        "daypart",
        "dietTags",
        "allergens",
      ],
      dateFields: {
        startTime: "hh:mm A", // Example format: 02:30 PM
        endTime: "hh:mm A", // Example format: 02:30 PM
      },
      enumFields: {
        quantityType: ["single", "combo"],
        availableDays: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
    })
  )
    return;

  let data = {
    image,
    title,
    description,
    type,
    subCategory,
    basePrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status,
    isLimitedTimeOffer,
    isScheduled,
    startDate,
    endDate,
    isAvailableInStock,
    upSellItem,
    availabilityType,
    event,
    presetType,
    brand,
    amountQuantity,
    quantityType,
    servingSize,
    availableDays,
    daypart,
    dietTags,
    allergens,
    cuisine,
    isRecommended,
    isTogo,
    isRequiresOrderConfirmation,
  };

  try {
    if (startDate) {
      data.startDate = convertTimezoneToUtc(startDate, timezone, "YYYY-MM-DD");
    }

    if (endDate) {
      data.endDate = convertTimezoneToUtc(endDate, timezone, "YYYY-MM-DD");
    }
    const allowedAvailabilityTypes = ['preOrdersOnly', 'preOrdersEvent', 'preOrderExclusive'];
    if (availabilityType && !allowedAvailabilityTypes.includes(availabilityType)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_availability_type",
        error: `availabilityType must be one of ${allowedAvailabilityTypes.join(', ')}`,
      });
    }

    if (startTime) {
      data.startTime = convertTimezoneToUtc(startTime, req.user.timezone, "hh:mm A");
    }

    if (endTime) {
      data.endTime = convertTimezoneToUtc(endTime, req.user.timezone, "hh:mm A");
    }
    id = new mongoose.Types.ObjectId(id);

    const updated = await menuItemsService.updateMenuItem(id, data, timezone);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_updated_successfully",
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

const deleteMenuItem = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await menuItemsService.deleteMenuItem(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_deleted_successfully",
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

const getMenuItemsByMenuId = async (req, res) => {
  const { menuId } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["menuId"],
      objectIdFields: ["menuId"],
    })
  )
    return;

  try {
    const menuItems = await menuItemsService.getMenuItemsByMenuId(menuId, req.user?.timezone);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: menuItems,
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

const getBundleMenuItems = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status = "active",
    menu,
    type,
    subCategory,
    startTime,
    endTime,
    date,
    companyOrganizer
  } = req.query;
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id
  }
  try {
    const { menuItems, meta } = await menuItemsService.getBundleMenuItems({
      page,
      limit,
      keyword,
      status,
      menu,
      type,
      subCategory,
      startTime,
      endTime,
      timezone: req.user?.timezone,
      date,
      companyOrganizer,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: menuItems,
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
  createMenuItem,
  importMenuItems,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  getMenuItemDetails,
  getMenuItemsByMenuId,
  getBundleMenuItems
};
