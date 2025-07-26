const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const categoriesService = require("./categoriesService");

const createCategory = async (req, res) => {
  const { image, title, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const category = await categoriesService.createCategory({
      image,
      title,
      status: "active",
      pinned: false,
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
  const { keyword, status, pinned } = req.query;

  try {
    const { categories, meta } = await categoriesService.getCategories({
      page,
      limit,
      keyword,
      status,
      pinned
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

const getPublicCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;
  try {
    const { categories, meta } = await categoriesService.getPublicCategories({
      page,
      limit,
      keyword,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
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

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { title, status, pinned } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await categoriesService.updateCategory(id, {
      title,
      status,
      pinned,
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
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getCategories,
  getPublicCategories,
  updateCategory,
  deleteCategory,
};
