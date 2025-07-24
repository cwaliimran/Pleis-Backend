const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
} = require("../../helperUtils/responseUtil");

const organizationService = require("./organizationService");

const createOrganization = async (req, res) => {
  const { title, description, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const organization = await organizationService.createOrganization({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "organization_created_successfully",
      data: organization,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.code === 11000 ? 400 : 500,
      translationKey:
        error.code === 11000
          ? "organization_title_unique_violation"
          : "internal_server",
      error: error.message,
    });
  }
};

const getOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;

  try {
    const { organizations, meta } = await organizationService.getOrganizations({
      page,
      limit,
      keyword,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,
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

const getPublicOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { organizations, meta } = await organizationService.getPublicOrganizations({
      page,
      limit,
      keyword,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_organizations_fetched_successfully",
      data: organizations,
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

const updateOrganization = async (req, res) => {
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
    const updated = await organizationService.updateOrganization(id, {
      title,
      description,
      ...(status !== undefined && { status }),
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "organization_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organization_updated_successfully",
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

const deleteOrganization = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await organizationService.deleteOrganization(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "organization_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organization_deleted_successfully",
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
  createOrganization,
  getOrganizations,
  getPublicOrganizations,
  updateOrganization,
  deleteOrganization,
};
