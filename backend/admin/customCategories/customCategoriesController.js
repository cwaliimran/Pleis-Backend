const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const customCategoriesService = require("./customCategoriesService");

const createCustomCategory = async (req, res) => {
  const { title, status = "active", type, objects, order } = req.body;

  if (!validateParams(req, res, { rawData: ["title", "type", "objects"], enumFields: { type: ["Event", "User", "Organizations"] } })) return;

  try {
    const customCategory = await customCategoriesService.createCustomCategory({
      title,
      status,
      type,
      objects,
      order
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "custom_category_created_successfully",
      data: customCategory,
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

const getCustomCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;
  const { timezone, _id: userId } = req.user || { timezone: "Asia/Karachi" };

  try {
    // Validate date parameter if provided
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    // Get custom categories from service (no need to populate here)
    
    const { customCategories, meta } = await customCategoriesService.getCustomCategories({
      userId,
      timezone,
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    // Send the response with the already populated custom categories
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "custom_categories_fetched_successfully",
      data: customCategories,  // Custom categories are already populated
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const updateCustomCategory = async (req, res) => {
  const { id } = req.params;
  const { title, status, type, objects, order } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await customCategoriesService.updateCustomCategory(id, {
      title,
      status,
      type,
      objects,
      order
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "custom_categorynot_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "custom_category_updated_successfully",
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

const deleteCustomCategory = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await customCategoriesService.deleteCustomCategory(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "custom_category_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "custom_category_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const reorderCustomCategory = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await customCategoriesService.reorderCustomCategory(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "custom_category_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "custom_category_reordered_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error
    });
  }
};
const getLoyaltyClubs = async (req, res) => {
  try {
    const loyaltyClubs = await customCategoriesService.getLoyaltyClubs();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_clubs_fetched_successfully",
      data: loyaltyClubs,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error
    });
  }
}

module.exports = {
  createCustomCategory,
  getCustomCategories,
  updateCustomCategory,
  deleteCustomCategory,
  reorderCustomCategory,
  getLoyaltyClubs,
};