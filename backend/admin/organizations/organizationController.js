const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { transformOperatingHoursToUtc } = require("../../shared/commonSchemas/operatingHours");

const organizationService = require("./organizationService");

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
      timezone
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
  const { keyword, date, status = "active", companyOrganizer } = req.query;

  let { _id, timezone } = req.user;
  if (companyOrganizer) {
    _id = new mongoose.Types.ObjectId(companyOrganizer);
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
      creator: _id,
      date,
      timezone
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

  let { timezone } = req.user;
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
        timezone
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

  let data = {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venue,
    location,
    pinned,
    image,
    tags,
    description,
    title,
    inAppOrderingSettings,
    companyDetails
  } = req.body;
  console.log("companyDetails", companyDetails);
  //Convert times to UTC minutes before saving
  if (operatingHours) {
    operatingHours = transformOperatingHoursToUtc(operatingHours, timezone);
    data.operatingHours = operatingHours;
  }

  try {

    const updated = await organizationService.updateOrganization({ id, data, timezone });

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
  const organization = await organizationService.getOrganizationDetails(id, timezone);
  if (!organization) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "organization_not_found",
    });
  }

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "organization_fetched_successfully",
    data: organization,
  });
};


const getOrganizationNamesByCompanyOrganizer = async (req, res) => {
  const { companyOrganizer } = req.params;

  try {
    //validate companyOrganizer
    if (
      !validateParams(req, res, {
        objectIdFields: ["companyOrganizer"],
      })
    ) return;

    const organizationNames = await organizationService.getOrganizationNamesByCompanyOrganizer(companyOrganizer);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizationNames,
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
const getOrganizationNotifications = async (req, res) => {
  const { id } = req.params;
  let { timezone } = req.user;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const notifications = await organizationService.getOrganizationNotifications(id, timezone);
  if (!notifications) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "organization_notifications_not_found",
    });
  }

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "organization_notifications_fetched_successfully",
    data: notifications,
  });
};

const getOrganizationsByTag = async (req, res) => {
  const { tagId } = req.params;
  let { timezone } = req.user;
  try {
    if (
      !validateParams(req, res, {
        pathParams: ["tagId"],
        objectIdFields: ["tagId"],
      })
    ) return;

    const organizations = await organizationService.getOrganizationsByTagService({ tagId, timezone });

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
};

const getOrganizationsByVenueType = async (req, res) => {
  const { venueTypeId } = req.params;
  let { timezone } = req.user;
  try {
    if (
      !validateParams(req, res, {
        pathParams: ["venueTypeId"],
        objectIdFields: ["venueTypeId"],
      })
    ) return;

    const organizations = await organizationService.getOrganizationsByVenueTypeService({ venueTypeId, timezone });

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
};

module.exports = {
  createOrganization,
  getOrganizations,
  getPublicOrganizations,
  getOrganizationDetails,
  updateOrganization,
  deleteOrganization,
  getOrganizationsAdmin,
  getOrganizationNamesByCompanyOrganizer,
  getOrganizationNotifications,
  getOrganizationsByTag,
  getOrganizationsByVenueType 
};
