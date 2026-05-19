const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const categoriesService = require("./menuItemCategoriesService");

const createCategory = async (req, res) => {
  let { image, title, status = "active", companyOrganizer } = req.body;

  if (!validateParams(req, res, {
    rawData: ["title"], enumFields: {
      status: ["active", "inactive", "deleted"],
    }
  })) return;
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id
  }
  try {
    const category = await categoriesService.createCategory({
      image,
      title,
      status,
      companyOrganizer
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
  let { keyword, status = 'active', date, companyOrganizer, sortBy, sortOrder } = req.query;

  const SORT_FIELDS = ["title", "createdAt"];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy)
      ? "invalid_sort_by_field"
      : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }


  try {
    // Validate date format if provided
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    // If the user is an organizer, assign their ID to companyOrganizer
    if (req.user.userType === "organizer") {
      companyOrganizer = req.user._id;
    }

    // Call the categories service to fetch the categories
    const { categories, meta } = await categoriesService.getCategories({
      page,
      limit,
      keyword,
      companyOrganizer,
      status,
      date,
      sortBy,
      sortOrder
    });

    // Send the response with the fetched categories and meta information
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta,
    });
  } catch (error) {
    // Catch any errors and send an error response
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
  const { keyword, date } = req.query;
  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { categories, meta } = await categoriesService.getPublicCategories({
      page,
      limit,
      keyword,
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

module.exports = {
  createCategory,
  getCategories,
  getPublicCategories,
  updateCategory,
  deleteCategory,
};
