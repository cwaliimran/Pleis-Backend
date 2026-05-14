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
  const {
    image,
    title,
    description = "",
    type,
    category,
    basePrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title", "type", "basePrice", "menu"],
      objectIdFields: ["menu", "category"],
      dateFields: {
        startTime: "hh:mm A", // Example format: 02:30 PM
        endTime: "hh:mm A", // Example format: 02:30 PM
      },
    })
  )
    return;

  let data = {
    image,
    title,
    description,
    type,
    category,
    basePrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status,
    creator: req.user?._id,
  };

  if (startTime) {
    data.startTime = convertTimezoneToUtc(startTime, timezone, "hh:mm A");
  }

  if (endTime) {
    data.endTime = convertTimezoneToUtc(endTime, timezone, "hh:mm A");
  }

  try {

    const menuItem = await menuItemsService.createMenuItem(data, timezone);
    if (!menuItem) {
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

const getMenuItems = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status = "active",
    menu,
    type,
    category,
    startTime,
    endTime,
    date,
    companyOrganizer,
    organization
  } = req.query;
  if(req.user.userType==="organizer")
  {
       companyOrganizer=req.user._id
  }
  if(!companyOrganizer){
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "company_organizer_is_required",
    });

    
  }
  companyOrganizer =new mongoose.Types.ObjectId(companyOrganizer);
  try {
    const { menuItems, meta } = await menuItemsService.getMenuItems({
      page,
      limit,
      keyword,
      status,
      menu,
      type,
      category,
      startTime,
      endTime,
      timezone: req.user?.timezone,
      date,
      companyOrganizer,
      organization
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
    category,
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
  } = req.body;
    if (availabilityType === 'preOrdersEvent' && !event) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "event_is_required_for_preOrdersEvent",
  
      });
    }

  if (upSellItem) {
    if (upSellItem === "true") {
      upSellItem = true;
    } else if (upSellItem === "false") {
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
      dateFields: {
        startTime: "hh:mm A", // Example format: 02:30 PM
        endTime: "hh:mm A", // Example format: 02:30 PM
      },
    })
  )
    return;

  let data = {
    image,
    title,
    description,
    type,
    category,
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
    category,
    startTime,
    endTime,
    date,
    companyOrganizer
  } = req.query;
if(req.user.userType==="organizer")  {
       companyOrganizer=req.user._id
  }
  try {
    const { menuItems, meta } = await menuItemsService.getBundleMenuItems({
      page,
      limit,
      keyword,
      status,
      menu,
      type,
      category,
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
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  getMenuItemDetails,
  getMenuItemsByMenuId,
  getBundleMenuItems
};
