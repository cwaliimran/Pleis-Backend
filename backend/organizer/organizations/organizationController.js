const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const organizationService = require("./organizationService");

const createOrganization = async (req, res) => {
  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    status = "active",
    venues,
    location,
    pinned,
    image,
    tags,
    description,
    title,
  } = req.body);
  let creator = req.user._id;
  data.creator = creator;

  if (!validateParams(req, res, { rawData: ["basicInfo"] })) return;

  try {
    const organization = await organizationService.createOrganization({
      data,
      creator: req.user._id,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "organization_created_successfully",
      data: organization,
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

const getOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active" } = req.query;
  let { _id } = req.user;
  try {
    const { organizations, meta } = await organizationService.getOrganizations({
      page,
      limit,
      keyword,
      status,
      creator: _id,
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
    const { organizations, meta } =
      await organizationService.getPublicOrganizations({
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

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venues,
    location,
    pinned,
    image,
    tags,
    description,
    title,
  } = req.body);

  try {
    const updated = await organizationService.updateOrganization(id, data);

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
