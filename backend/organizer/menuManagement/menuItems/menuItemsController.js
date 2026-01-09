const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertDateFormat,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const menuItemsService = require("./menuItemsService");

const createMenuItem = async (req, res) => {
  let { timezone } = req.user;
  const {
    image,
    title,
    description = "",
    type,
    category,
    basePrice,
    discountPrice,
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
    discountPrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status,
    creator: req.user?._id,
  };

  if (startTime && endTime) {
    data.startTime = convertTimezoneToUtc(startTime, timezone, "hh:mm A");
    data.endTime = convertTimezoneToUtc(endTime, timezone, "hh:mm A");

    if (data.startTime >= data.endTime) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_time_must_be_after_start_time",
      });
    }
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
  const {
    keyword,
    status = "active",
    menu,
    type,
    category,
    startTime,
    endTime,
    date,
    organization,
  } = req.query;
  const userId = req.user?._id;
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
      userId,
      timezone: req.user?.timezone,
      date,
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
    const menuItem = await menuItemsService.getMenuItemDetails(id);
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
  const { id } = req.params;
  let { timezone } = req.user;
  const {
    image,
    title,
    description,
    type,
    category,
    basePrice,
    discountPrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status = "active",
  } = req.body;

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
    discountPrice,
    taxPercent,
    menu,
    startTime,
    endTime,
    status,
  };

  try {

    if (startTime && endTime) {
      data.startTime = convertTimezoneToUtc(startTime, req.user.timezone, "hh:mm A");
      data.endTime = convertTimezoneToUtc(endTime, req.user.timezone, "hh:mm A");

      if (data.startTime >= data.endTime) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "end_time_must_be_after_start_time",
        });
      }
    }

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


module.exports = {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  getMenuItemDetails,
};
