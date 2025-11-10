const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { RecentlyViewedItemTargetTypes } = require("./RecentlyViewedItem");
const recentlyViewedItemService = require("./recentlyViewedItemService");

/**
 * @desc Add or update recently viewed item
 * @route POST /api/v1/recentlyViewedItems
 * @access Authenticated users
 */
const addOrUpdateRecentlyViewedItem = async (req, res) => {
  const { targetId, targetType } = req.body;
  const userId = req.user._id;

  if (
    !validateParams(req, res, {
      rawData: ["targetId", "targetType"],
      objectIdFields: ["targetId"],
      enumFields: {
        targetType: RecentlyViewedItemTargetTypes,
      },
    })
  )
    return;

  try {
    const result = await recentlyViewedItemService.addOrUpdateRecentlyViewedItem(
      userId,
      targetId,
      targetType
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "recently_viewed_item_added_or_updated",
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

/**
 * @desc Get user recently viewed items (paginated)
 * @route GET /api/v1/recentlyViewedItems/user
 * @access Authenticated users
 */
const getUserRecentlyViewedItems = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { targetType } = req.query;
  const { _id: userId, location, timezone } = req.user;

  try {
    if (
      targetType &&
      !validateParams(req, res, {
        enumFields: {
          targetType: RecentlyViewedItemTargetTypes,
        },
      })
    )
      return;

    const { recentlyViewedItems, meta } = await recentlyViewedItemService.getUserRecentlyViewedItems({
      userId,
      location,
      timezone,
      targetType,
      page,
      limit,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "recently_viewed_items_fetched_successfully",
      data: recentlyViewedItems,
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

/**
 * @desc Check if user has viewed a specific target
 * @route GET /api/v1/recentlyViewedItems/:targetType/:targetId/status
 * @access Authenticated users
 */
const isRecentlyViewedItemd = async (req, res) => {
  const { targetType, targetId } = req.params;
  const userId = req.user._id;

  if (
    !validateParams(req, res, {
      pathParams: ["targetType", "targetId"],
      objectIdFields: ["targetId"],
      enumFields: {
        targetType: RecentlyViewedItemTargetTypes,
      },
    })
  )
    return;

  try {
    const viewed = await recentlyViewedItemService.isRecentlyViewedItemd(userId, targetId, targetType);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: viewed
        ? "user_has_viewed_item"
        : "user_has_not_viewed_item",
      data: { viewed },
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
  addOrUpdateRecentlyViewedItem,
  getUserRecentlyViewedItems,
  isRecentlyViewedItemd,
};
