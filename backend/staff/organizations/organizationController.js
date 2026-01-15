const {
  sendResponse,
} = require("../../helperUtils/responseUtil");

const {
  transformOperatingHoursToLocal
} = require("../../shared/commonSchemas/operatingHours");

const { formatItemCategory } = require("./formatter/formatMenuItems");
const organizationService = require("./organizationService");


const getOrganizationsAsStaff = async (req, res) => {
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;  

    // Fetch organizations array
    let organizations = await organizationService.getOrganizationsAsStaff(userId);

    organizations = organizations.map((org) => {
      const obj = org.toObject ? org.toObject() : org;

      // Convert hours to local timezone
      if (obj.operatingHours) {
        obj.operatingHours = transformOperatingHoursToLocal(
          obj.operatingHours,
          timezone
        );
      }

      // Apply image formatting
      return formatItemCategory(obj);   // ✅ FIX #2
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
