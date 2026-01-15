const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Menuervice = require("./menuManagementService");

const createSale = async (req, res) => {
  let {
    title,
    discountType = "fixed",
    discountValue = 0,
    menuItems,
    startDateTime,
    endDateTime,
    creator
  } = req.body;

  // Ensure that menuItems is an array and is not empty
  if (!Array.isArray(menuItems) || menuItems.length === 0) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "Invalid_menu_items",
      error: "menuItems must be a non-empty array of menu item IDs",
    });
  }



  // Convert endDateTime to UTC based on the user's timezone
  const timezone = req.user.timezone;
  endDateTime = convertTimezoneToUtc(endDateTime, timezone, "YYYY-MM-DD hh:mm A");
  startDateTime = convertTimezoneToUtc(startDateTime, timezone, "YYYY-MM-DD hh:mm A");

  // Validate required parameters
  if (
    !validateParams(req, res, {
      rawData: [
        "title",
        "menuItems",
        "startDateTime",
        "endDateTime",
        "creator",
      ],
    })
  ) return;
  creator = new mongoose.Types.ObjectId(creator);
  // Construct the sale data
  let data = {
    title,
    discountType,
    discountValue,
    menuItems,
    startDateTime,
    endDateTime,
    creator,
  };

  try {
    // Create the MenuItemsSale entry
    const menuItemSale = await Menuervice.createSale(data);

    if (!menuItemSale) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Menu_creation_failed",
      });
    }

    // Respond with the success message
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Menu_created_successfully",
      data: menuItemSale,
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
  let { keyword, status, date, range, organization } = req.query;
  try {
 
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_id_is_required",
      });
    }

    organization = new mongoose.Types.ObjectId(organization);
    const timezone = req.user.timezone;
    const { MenuItems, meta } = await Menuervice.getMenuItems({
      timezone,
      page,
      limit,
      keyword,
      status,
      organization,
      date,
      range,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Menu_fetched_successfully",
      data: MenuItems,
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
const updateMenu = async (req, res) => {
  const { id } = req.params;
  const {
    status,
    paymentStatus,
    deliveredMenuItem,
    deliveredall
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;


  let data = {
    status,
    paymentStatus,
    deliveredMenuItem,
    deliveredall
  };



  try {
    const updated = await Menuervice.updateMenu(id, data);
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
        translationKey: "order_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "order_updated_successfully",
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












const getMenuItemCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range } = req.query;
  try {
    const timezone = req.user.timezone;
    const { MenuItems, meta } = await Menuervice.getMenuItemCategories({
      timezone,
      page,
      limit,
      keyword,
      status,

      date,
      range,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Menu_fetched_successfully",
      data: MenuItems,
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


const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organizer } = req.query;
  try {
    if (!organizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organizer_id_is_required",
      });
    }

    organizer = new mongoose.Types.ObjectId(organizer);
    const timezone = req.user.timezone;
    const { MenuItems, meta } = await Menuervice.getEvents({
      timezone,
      page,
      limit,
      keyword,
      status,
      organizer,
      date,
      range,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Menu_fetched_successfully",
      data: MenuItems,
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








const createLimitedTimeItem = async (req, res) => {
  let { timezone } = req.user;
  let {
    menuItems,
    startTime,
    startDate,
    endDate,
    isScheduled,
    endTime,
    isLimitedTimeOffer = true,
    event,
    availabilityType,
    upSellItem,
    status = "active",
  } = req.body;
if(!startDate || !endDate|| !startTime || !endTime ){
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "date_and_time_fields_are_required",
    });
  }
  // Ensure menuItems is an array if provided
  if (!menuItems || !Array.isArray(menuItems)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "menu_items_must_be_an_array",
      error: "menuItems must be an array",
    });
  }

  // Validate availabilityType
  const allowedAvailabilityTypes = ['preOrdersOnly', 'preOrdersEvent', 'preOrderExclusive'];
  if (!availabilityType || !allowedAvailabilityTypes.includes(availabilityType)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_availability_type",
      error: `availabilityType must be one of ${allowedAvailabilityTypes.join(', ')}`,
    });
  }
  if (!upSellItem) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "upSellItem_value_required",
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


  // If availabilityType is 'preOrdersEvent', event must be provided
  if (availabilityType === 'preOrdersEvent' && !event) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "event_is_required_for_preOrdersEvent",

    });
  }
  if (
    !validateParams(req, res, {
      dateFields: {
        startTime: "hh:mm A", // Example format: 02:30 PM
        endTime: "hh:mm A",   // Example format: 02:30 PM
        startDate: "YYYY-MM-DD", // Example format: 2026-01-01
        endDate: "YYYY-MM-DD",   // Example format: 2026-01-01
      },
      requiredFields: [
        "menuItems",         // Ensure menuItems are provided
        "startDate",         // Ensure startDate is provided
        "endDate",           // Ensure endDate is provided
        "startTime",         // Ensure startTime is provided
        "endTime",           // Ensure endTime is provided
        "availabilityType",  // Ensure availabilityType is provided

      ]
    })
  )
    return;

  let data = {
    startTime,
    endTime,
    status,
    menuItems,
    availabilityType,
    isLimitedTimeOffer,
    event,
    upSellItem,
    isScheduled
  };

  try {
    // Convert dates to UTC if provided
    if (startDate && endDate) {
      data.startDate = convertTimezoneToUtc(startDate, timezone, "YYYY-MM-DD");
      data.endDate = convertTimezoneToUtc(endDate, timezone, "YYYY-MM-DD");
    }

    if (startTime && endTime) {
      // Convert startTime and endTime to UTC based on the user's timezone
      data.startTime = convertTimezoneToUtc(startTime, req.user.timezone, "hh:mm A");
      data.endTime = convertTimezoneToUtc(endTime, req.user.timezone, "hh:mm A");

      // Validate that start time is before end time
      if (data.startTime >= data.endTime) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "end_time_must_be_after_start_time",
        });
      }
    }

    // Update the menu item with the provided data
    const result = await Menuervice.createLimitedTimeItem(data, timezone);

    if (!result) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    // Return success response
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_updated_successfully",
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
  }
};



const createMenuItemFromPreset = async (req, res) => {
  let { timezone } = req.user;
  let {
    preSets,
    menuId
  } = req.body;
  // Ensure menuItems is an array if provided
  if (!preSets || !Array.isArray(preSets)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "preSets_must_be_an_array",
      error: "preSets must be an array",
    });
  }

if (
    !validateParams(req, res, {
      requiredFields: [
        "preSets",
        "menuId"
      ]
    })
  )
    return;


  let data = {
    preSets,
    menuId
  };

  try {
    const result = await Menuervice.createMenuItemFromPreset(data, timezone);
    if (!result) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    // Return success response
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_updated_successfully",
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
  }
};
const getSummary = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organization,filter,sortBy,categoryId } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_id_is_required",
      });
    }

    organization = new mongoose.Types.ObjectId(organization);
    const timezone = req.user.timezone;
    const { MenuItems, meta } = await Menuervice.getSummary({
      timezone,
      page,
      limit,
      keyword,
      status,
      organization,
      date,
      range,
      filter,sortBy,categoryId
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Menu_fetched_successfully",
      data: MenuItems,
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
  getMenuItems,
  updateMenu,
  getMenuItemCategories,
  getEvents,
  createSale,
  createLimitedTimeItem,
  createMenuItemFromPreset,
  getSummary
};