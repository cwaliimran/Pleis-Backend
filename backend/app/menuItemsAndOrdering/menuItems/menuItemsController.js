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
const deliveryOptionsService = require("../../../admin/organizations/deliveryOptions/deliveryOptionsService");
const { getOrganizationPickupSettings } = require("../../../admin/organizations/organizationRepository");
const { getSetttings } = require("../../../admin/inAppOrdering/settings/setting/settingRepository");

const getMenuItems = async (req, res) => {
  const { status = "active", organization } = req.query;
  let { _id: userId } = req.user;
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
const getMenuItemsV2 = async (req, res) => {
  const { status = "active", organization } = req.query;
  let { _id: userId } = req.user;
  try {
    const { organizationDetails, recommended, menu, combos } = await menuItemsService.getMenuItemsV2({
      userId,
      status,
      timezone: req.user?.timezone,
      organization,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: { organization: organizationDetails, recommended, menu, combos },
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
  const { organization } = req.query;
  let { _id: userId, timezone } = req.user;
  try {
    const { recommended } = await menuItemsService.getHybridRecommendedItems({
      userId,
      timezone,
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

const getRecommendedMenuItemsV2 = async (req, res) => {
  const { organization } = req.query;
  let { _id: userId, timezone } = req.user;
  try {
    const { recommended } = await menuItemsService.getRecommendedMenuItemsV2({
      userId,
      timezone,
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

const getUpsellMenuItemsV2 = async (req, res) => {
  const { organization } = req.query;
  let { _id: userId, timezone } = req.user;
  try {
    const { recommended } = await menuItemsService.getUpsellMenuItemsV2({
      userId,
      timezone,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "upsell_items_fetched_successfully",
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
  const { _id: userId, timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const { menuItem } = await menuItemsService.getMenuItemDetails(id, userId, timezone);
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

const getMenuItemDetailsV2 = async (req, res) => {
  const { id } = req.params;
  const { _id: userId, timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const { menuItem } = await menuItemsService.getMenuItemDetailsV2(id, userId, timezone);
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

const getPickupOptions = async (req, res) => {
  const { organization } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["organization"],
      objectIdFields: ["organization"],
    })
  )
    return;

  try {
    const [deliveryOptions, orderingSettings, appSettings] = await Promise.all([
      deliveryOptionsService.getActiveDeliveryOptions(organization),
      getOrganizationPickupSettings(organization),
      getSetttings({ organization }),
    ]);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "pickup_options_fetched_successfully",
      data: {
        deliveryOptions,
        paymentMethods: orderingSettings.paymentMethods,
        deliveryMethods: orderingSettings.deliveryMethods,
        tips: orderingSettings.tips,
        appSettings,
      },
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
  getRecommendedMenuItems,
  getRecommendedMenuItemsV2,
  getUpsellMenuItemsV2,
  getMenuItemDetails,
  getMenuItemDetailsV2,
  getPickupOptions,
};
