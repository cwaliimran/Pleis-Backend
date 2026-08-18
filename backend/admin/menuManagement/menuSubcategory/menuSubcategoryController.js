const convertToMongoArray = require("@utils/convertToMongoArray");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const MenuSubcategoryService = require("./menuSubcategoryService");

const createMenuSubcategory = async (req, res) => {
  let { title, status = "active", organization, companyOrganizer,order } = req.body;
  const userType = req.user.userType;
  if (userType !== "admin") {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_required",
      });
    }
    companyOrganizer = req.user._id;
  }

  if (
    !validateParams(req, res, {
      rawData: ["title", "status"],
    })
  )
    return;
  let data = {
    title,
    status,
    organization,
    companyOrganizer,
    order,
  };
  try {
    const MenuSubcategory =
      await MenuSubcategoryService.createMenuSubcategory(data);
    if (!MenuSubcategory) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "MenuSubcategory_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "MenuSubcategory_created_successfully",
      data: MenuSubcategory,
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
const getMenuSubcategorys = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status,
    sortBy,
    sortOrder,
    summary,
    organization,
    companyOrganizer,
    isNullAllowed = true,
  } = req.query;
  try {
    const userType = req.user.userType;
    if (!companyOrganizer && userType !== "admin") {
      companyOrganizer = req.user._id;
    }
    if (organization) {
      organization = await convertToMongoArray(organization);
      companyOrganizer = null;
    }

    const SORT_FIELDS = ["title", "createdAt", "status", "organization", "order"];
    const SORT_ORDERS = ["asc", "desc"];
    if (
      (sortBy && !SORT_FIELDS.includes(sortBy)) ||
      (sortOrder && !SORT_ORDERS.includes(sortOrder))
    ) {
      const key =
        sortBy && !SORT_FIELDS.includes(sortBy)
          ? "invalid_sort_by_field"
          : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy
        ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }
    const { MenuSubcategorys, meta } =
      await MenuSubcategoryService.getMenuSubcategorys({
        timezone: req.user.timezone,
        page,
        limit,
        keyword,
        status,
        sortBy,
        sortOrder,
        summary,
        organization,
        companyOrganizer,
        isNullAllowed,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuSubcategorys_fetched_successfully",
      data: MenuSubcategorys,
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
const updateMenuSubcategory = async (req, res) => {
  const { id } = req.params;
  let { organization, companyOrganizer, title, status, order } = req.body;

  if (order !== undefined && order !== null && order !== "") {
    order = Number(order);
    if (!Number.isFinite(order)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_order",
      });
    }
  } else {
    order = undefined;
  }

  let data = {
    organization,
    companyOrganizer,
    title,
    status,
    order,
  };

  try {
    const updated = await MenuSubcategoryService.updateMenuSubcategory(
      id,
      data,
    );
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuSubcategory_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuSubcategory_updated_successfully",
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

const deleteMenuSubcategory = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await MenuSubcategoryService.deleteMenuSubcategory(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuSubcategory_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuSubcategory_deleted_successfully",
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
const reorderMenuSubCategory = async (req, res) => {
  const { id } = req.params;
  const { newOrder } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      rawData: ["newOrder"],
    })
  )
    return;
  const targetOrder = Number(newOrder);
  if (!Number.isFinite(targetOrder)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_order",
    });
  }

  try {
    const reordered = await MenuSubcategoryService.reorderMenuSubCategory(
      id,
      targetOrder,
    );
    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "MenuSubcategory_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "MenuSubcategory_reordered_successfully",
      data: reordered,
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
  createMenuSubcategory,
  getMenuSubcategorys,
  updateMenuSubcategory,
  deleteMenuSubcategory,
  reorderMenuSubCategory,
};
