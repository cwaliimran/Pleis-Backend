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


const getMenuItems = async (req, res) => {
  const {
    status = "active",
    organization
  } = req.query;
  try {
    const { recommended, menu } = await menuItemsService.getMenuItems({
      status,
      timezone: req.user?.timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: { recommended, menu },
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
    const {menuItem, recommended} = await menuItemsService.getMenuItemDetails(id);
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
      data: { menuItem, recommended },
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
  getMenuItemDetails,
};
