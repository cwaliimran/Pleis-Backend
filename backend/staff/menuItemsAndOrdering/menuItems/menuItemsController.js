const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const menuItemsService = require("./menuItemsService");
const { resolveMenuIdsFromBody } = require("../../../shared/menuItems/menuField");


const getMenuItems = async (req, res) => {
  const { organization } = req.query;
  try {
    const { menu } = await menuItemsService.getMenuItems({
      timezone: req.user?.timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
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

const getMenuItemsV2 = async (req, res) => {
  const { organization } = req.query;
  try {
    const { menu, combos } = await menuItemsService.getMenuItemsV2({
      timezone: req.user?.timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: { menu, combos },
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

const getMenuItemsToManage = async (req, res) => {
  const {
    organization
  } = req.query;
  try {
    const { menu, meta } = await menuItemsService.getMenuItemsToManage({
      timezone: req.user?.timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: { menu, meta },
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
    const { menuItem } = await menuItemsService.getMenuItemDetails(
      id,
      req.user?.timezone,
    );
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
      data: { menuItem },
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



const updateMenuStock = async (req, res) => {
  const {
    type,
    menu
  } = req.body;
  try {
    let { timezone } = req.user;

    if (
      !validateParams(req, res, {
        rawData: ["type", "menu"],
        objectIdFields: ["menu"],
        enumFields: {
          type: ["allInStock", "allOutOfStock"]
        }
      })
    )
      return;

    const data = await menuItemsService.updateMenuStockService({
      type,
      menu,
      timezone
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_stock_updated_successfully",
      data,
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
    taxPercent,
    menu,
    menuIds,
    startTime,
    endTime,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["menu", "menuIds"],
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
    menu: resolveMenuIdsFromBody({ menuIds, menu }),
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

module.exports = {
  getMenuItems,
  getMenuItemsV2,
  getMenuItemsToManage,
  getMenuItemDetails,
  updateMenuStock,
  updateMenuItem,
};
