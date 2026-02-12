const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const categoriesService = require("./globalRewardCategoriesService");

const createCategory = async (req, res) => {
  const { image, title, status = "active" } = req.body;
const createID = req.user._id;
  if (!validateParams(req, res, {
    rawData: ["title"], enumFields: {
      status: ["active", "inactive", "deleted"],
    }
  })) return;


  try {
    const category = await categoriesService.createCategory({
      image,
      title,
      status,
      createID,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "category_created_successfully",
      data: category,
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

const getCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
const createID = req.user._id;
  // Validate status value if provided
  const allowedStatuses = ["active", "inactive", "deleted"];
  if (status && !allowedStatuses.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_status_value",
      error: "Status must be one of: active, inactive, deleted",
    });
  }

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { categories, meta } = await categoriesService.getCategories({
      page,
      limit,
      keyword,
      status,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};



const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { image, title, status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      enumFields: {
        status: ["active", "inactive", "deleted"],
      },
    })
  )
    return;


  try {
    const updated = await categoriesService.updateCategory(id, {
      image,
      title,
      status,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "category_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "category_updated_successfully",
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

const deleteCategory = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await categoriesService.deleteCategory(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "category_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "category_deleted_successfully",
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
const getCategoriesTitleOnly = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
const createID = req.user._id;
  // Validate status value if provided
  const allowedStatuses = ["active", "inactive", "deleted"];
  if (status && !allowedStatuses.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_status_value",
      error: "Status must be one of: active, inactive, deleted",
    });
  }

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { categories, meta } = await categoriesService.getCategoriesTitleOnly({
      page,
      limit,
      keyword,
      status,
      date,
      createID,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};
module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesTitleOnly
};
