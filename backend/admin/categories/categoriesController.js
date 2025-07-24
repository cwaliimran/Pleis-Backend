const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../helperUtils/responseUtil");

const categoriesService = require("./categoriesService");

const createCategory = async (req, res) => {
  const { title, description, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const category = await categoriesService.createCategory({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "category_created_successfully",
      data: category,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.code === 11000 ? 400 : 500,
      translationKey:
        error.code === 11000
          ? "category_title_unique_violation"
          : "internal_server",
      error: error.message,
    });
  }
};

const getCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;

  try {
    const { categories, meta } = await categoriesService.getCategories({
      page,
      limit,
      keyword,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta: generateMeta(page, limit, meta.total, meta.categoriesCount),
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
      meta: generateMeta(page, limit, meta.total),
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

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;

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
      description,
      ...(status !== undefined && { status }),
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
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error: error.message,
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
