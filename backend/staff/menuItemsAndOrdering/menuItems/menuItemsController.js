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
  let {_id: userId} = req.user;
  try {
    const { organizationDetails, recommended, menu } = await menuItemsService.getMenuItems({
      userId,
      status,
      timezone: req.user?.timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: { organization: organizationDetails, recommended, menu },
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

const getRecommendedMenuItems = async (req, res) => {
  const {
    organization
  } = req.query;
  try {
    const { recommended } = await menuItemsService.getHybridRecommendedItems({
      userId: req.user?._id,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "recommended_items_fetched_successfully",
      data: recommended,
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
    const { menuItem, recommended } = await menuItemsService.getMenuItemDetails(id);
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

const getPickupOptions = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    // TODO get from organization settings when implemented
    // const pickupOptions = await menuItemsService.getPickupOptions(id);
    const pickupOptions = [
      { type: "counter", timing: "07:00 - 02:45" },
      //table service only for dine-in
      { type: "tableService", timing: "07:00 - 02:45" },
      //togo
      { type: "togo", timing: "07:00 - 02:45" },
    ]
    if (!pickupOptions) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "menu_item_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pickup_options_fetched_successfully",
      data: pickupOptions,
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
}

module.exports = {
  getMenuItems,
  getRecommendedMenuItems,
  getMenuItemDetails,
  getPickupOptions,
};
