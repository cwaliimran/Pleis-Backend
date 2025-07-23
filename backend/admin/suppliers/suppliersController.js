const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../helperUtils/responseUtil");

const supplierService = require("./supplierService");

const createSupplier = async (req, res) => {
  const { title, description, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const supplier = await supplierService.createSupplier({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "supplier_created_successfully",
      data: supplier,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.code === 11000 ? 400 : 500,
      translationKey:
        error.code === 11000
          ? "supplier_title_unique_violation"
          : "internal_server",
      error: error.message,
    });
  }
};

const getSuppliers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;

  try {
    const { suppliers, meta } = await supplierService.getSuppliers({
      page,
      limit,
      keyword,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "suppliers_fetched_successfully",
      data: suppliers,
      meta: generateMeta(page, limit, meta.total, meta.tagsCount),
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

const getPublicSuppliers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { suppliers, meta } = await supplierService.getPublicSuppliers({
      page,
      limit,
      keyword,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_suppliers_fetched_successfully",
      data: suppliers,
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

const updateSupplier = async (req, res) => {
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
    const updated = await supplierService.updateSupplier(id, {
      title,
      description,
      ...(status !== undefined && { status }),
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "supplier_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "supplier_updated_successfully",
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

const deleteSupplier = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await supplierService.deleteSupplier(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "supplier_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "supplier_deleted_successfully",
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
  createSupplier,
  getSuppliers,
  getPublicSuppliers,
  updateSupplier,
  deleteSupplier,
};
