const {
  sendResponse,
} = require("../../helperUtils/responseUtil");
const { transformOperatingHoursToUtc, transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");

const organizationService = require("./organizationService");


const getOrganizationsAsStaff = async (req, res) => {
  try {
    const userId = req.user._id;

    // service returns ONLY array
    let organizations = await organizationService.getOrganizationsAsStaff(userId);

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
};









module.exports = {

  getOrganizationsAsStaff,
};
