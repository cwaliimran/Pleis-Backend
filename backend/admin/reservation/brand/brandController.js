const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const BrandService = require("./brandService");

const createBrand = async (req, res) => {
  let { name, status = "active", brandOwner } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["name", "status", "brandOwner"],
    })
  )
    return;
  let data = {
    user,
    name,
    status,
    brandOwner,
  };
  try {
    const Brand = await BrandService.createBrand(data);
    if (!Brand) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Brand_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Brand_created_successfully",
      data: Brand,
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
const getBrands = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const {
    keyword,
    status,
    date,
    sortBy,
    sortOrder,
    summary
  } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = ["name", "brandOwner", "createdAt", "status"];
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
    const { Brands, meta } = await BrandService.getBrands({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      date,
      sortBy,
      sortOrder,
      summary
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Brands_fetched_successfully",
      data: Brands,
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
const updateBrand = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    brandOwner,
    status,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    brandOwner,
    status,
  };

  try {
    const updated = await BrandService.updateBrand(id, data);
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
        translationKey: "Brand_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Brand_updated_successfully",
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

const deleteBrand = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await BrandService.deleteBrand(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Brand_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Brand_deleted_successfully",
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
  createBrand,
  getBrands,
  updateBrand,
  deleteBrand,
};
