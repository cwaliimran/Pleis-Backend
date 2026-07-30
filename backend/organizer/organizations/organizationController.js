const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { transformOperatingHoursToUtc, transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");

const organizationService = require("./organizationService");
const {
  validateInAppOrderingSettingsV2,
} = require("../../shared/organizations/inAppOrderingSettingsV2");

const createOrganization = async (req, res) => {

  let { timezone } = req.user

  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    location,
    pinned,
    image,
    tags,
    description,
    title,
    phoneNumber,
    website,
  } = req.body);
  let creator = req.user._id;
  if (req.user.userType === "admin") {
    if (basicInfo && basicInfo.user) {
      creator = basicInfo.user;
    }
  }
  data.creator = creator;

  if (!validateParams(req, res, { rawData: ["basicInfo"] })) return;

  //Convert times to UTC minutes before saving
  if (operatingHours) {
    operatingHours = transformOperatingHoursToUtc(operatingHours, timezone);
    data.operatingHours = operatingHours;
  }

  try {
    const organization = await organizationService.createOrganization({
      data,
      creator,
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

const createOrganizationV2 = async (req, res) => {
  let { timezone } = req.user;

  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    location,
    pinned,
    image,
    tags,
    description,
    title,
    phoneNumber,
    website,
    inAppOrderingSettings,
  } = req.body);

  let creator = req.user._id;
  if (req.user.userType === "admin") {
    if (basicInfo && basicInfo.user) {
      creator = basicInfo.user;
    }
  }
  data.creator = creator;

  if (!validateParams(req, res, { rawData: ["basicInfo"] })) return;

  if (inAppOrderingSettings) {
    const tipsError = validateInAppOrderingSettingsV2(inAppOrderingSettings);
    if (tipsError) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: tipsError,
      });
    }
    data.inAppOrderingSettings = inAppOrderingSettings;
  }

  if (operatingHours) {
    operatingHours = transformOperatingHoursToUtc(operatingHours, timezone);
    data.operatingHours = operatingHours;
  }

  try {
    const organization = await organizationService.createOrganizationV2({ data });

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
  let { keyword, date, status = "active", companyOrganizer,sortBy,sortOrder } = req.query;
  let creator = req.user._id;
  const SORT_FIELDS = [ "createdAt", "organizationName"];
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

  if (req.user.originalUserId) {
    companyOrganizer = req.user.originalUserId;
  }
  let { timezone } = req.user;
  if (companyOrganizer) {
    creator = new mongoose.Types.ObjectId(companyOrganizer);
  }
  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;
    let { organizations, meta } = await organizationService.getOrganizations({
      page,
      limit,
      keyword,
      status,
      creator,
      date,
      sortBy,
      sortOrder
    });
    // Transform to local time safely
    organizations = organizations.map((org) => {
      const orgObj = org.toObject ? org.toObject() : org;

      if (orgObj.operatingHours) {
        orgObj.operatingHours = transformOperatingHoursToLocal(
          orgObj.operatingHours,
          timezone
        );
      }

      return orgObj;
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,
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

const getOrganizationsAdmin = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date, status = "active", companyOrganizer } = req.query;
  let { timezone } = req.user;
  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;
    let { organizations, meta } = await organizationService.getOrganizationsByAdmin({
      companyOrganizer,
      page,
      limit,
      keyword,
      status,
      date,
      timezone
    });

    // Transform to local time safely
    organizations = organizations.map((org) => {
      const orgObj = org.toObject ? org.toObject() : org;

      if (orgObj.operatingHours) {
        orgObj.operatingHours = transformOperatingHoursToLocal(
          orgObj.operatingHours,
          timezone
        );
      }

      return orgObj;
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,
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

const getPublicOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    let { organizations, meta } =
      await organizationService.getPublicOrganizations({
        page,
        limit,
        keyword,
        date,
      });

    // Transform to local time safely
    organizations = organizations.map((org) => {
      const orgObj = org.toObject ? org.toObject() : org;

      if (orgObj.operatingHours) {
        orgObj.operatingHours = transformOperatingHoursToLocal(
          orgObj.operatingHours,
          timezone
        );
      }

      return orgObj;
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
      error,
    });
  }
};

const updateOrganization = async (req, res) => {
  const { id } = req.params;
  let { timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const userId = req.user._id;
  let data = ({
    basicInfo,
    otherInfo,
    companyDetails,
    operatingHours,
    status,
    venue,
    location,
    pinned,
    image,
    tags,
    description,
    title,
    subscriptionTypes,
    pricingPlan,
    numberOfOrganizations,
    totalSubscriptionAmount,
    inAppOrderingSettings
  } = req.body);
  data.userId = userId;

  //Convert times to UTC minutes before saving
  if (operatingHours) {
    operatingHours = transformOperatingHoursToUtc(operatingHours, timezone);
    data.operatingHours = operatingHours;
  }

  try {
    const updated = await organizationService.updateOrganization({ id, data });

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
      error: error,
    });
  }
};

const updateOrganizationV2 = async (req, res) => {
  const { id } = req.params;
  const { inAppOrderingSettings } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  if (!inAppOrderingSettings) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "in_app_ordering_settings_required",
    });
  }

  const tipsError = validateInAppOrderingSettingsV2(inAppOrderingSettings);
  if (tipsError) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: tipsError,
    });
  }

  try {
    const updated = await organizationService.updateOrganizationV2({
      id,
      inAppOrderingSettings,
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
      error,
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
      error,
    });
  }
};

const getOrganizationDetails = async (req, res) => {
  const { id } = req.params;
  let { timezone } = req.user;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const organization = await organizationService.findOrganizationById(id);
  if (!organization) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "organization_not_found",
    });
  }


  if (organization.operatingHours) {
    organization.operatingHours = transformOperatingHoursToLocal(organization.operatingHours, timezone);
  }

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "organization_fetched_successfully",
    data: organization,
  });
};

const getOrganizationsAsStaff = async (req, res) => {
  let { _id, timezone } = req.user;
  try {
    let organizations = await organizationService.getOrganizationsAsStaff(_id);

    // Transform to local time safely
    organizations = organizations.map((org) => {
      const orgObj = org.toObject ? org.toObject() : org;

      if (orgObj.operatingHours) {
        orgObj.operatingHours = transformOperatingHoursToLocal(
          orgObj.operatingHours,
          timezone
        );
      }

      return orgObj;
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}
const getAllOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date, status = "active" } = req.query;

  let { _id, timezone } = req.user;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;
    let creator = _id;
    if (req.user.originalUserId) {
      creator = req.user.originalUserId;
    }
    let { organizations, meta } = await organizationService.getAllOrganizations({
      page,
      limit,
      keyword,
      status,
      creator,
      date,
    });

    // Transform to local time safely
    organizations = organizations.map((org) => {
      const orgObj = org.toObject ? org.toObject() : org;

      if (orgObj.operatingHours) {
        orgObj.operatingHours = transformOperatingHoursToLocal(
          orgObj.operatingHours,
          timezone
        );
      }

      return orgObj;
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,
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
module.exports = {
  createOrganization,
  createOrganizationV2,
  getOrganizations,
  getPublicOrganizations,
  getOrganizationDetails,
  updateOrganization,
  updateOrganizationV2,
  deleteOrganization,
  getOrganizationsAdmin,
  getOrganizationsAsStaff,
  getAllOrganizations
};
