const jwt = require("jsonwebtoken");
const { User } = require("../models/UserModel");
const { sendResponse } = require("../helperUtils/responseUtil");
const { i18nConfig } = require("../config/i18nConfig");
const { userCache } = require("../config/nodeCache");
const { getOrganizationsAsStaff } = require("../staff/organizations/organizationService");

const hasField = (obj, path) => {
  return (
    path.split(".").reduce((o, key) => (o ? o[key] : undefined), obj) !==
    undefined
  );
};

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "auth_header_missing",
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "auth_token_missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded._id;
    const originalUserId = decoded.originalUserId || null; // For impersonation
    userCache.del(userId.toString()); // Invalidate cache to ensure fresh data on next request
    // Retrieve user from cache if available
    let user = userCache.get(userId);

    // Check if the user object is missing required fields
    const requiredFields = [
      "firstName",
      "lastName",
      "profileIcon",
      "timezone",
      "language",
      "location",
      "userType",
      "accountState"
    ];

    const isMissingRequiredFields =
      !user || requiredFields.some((field) => !hasField(user, field));

    if (!user || isMissingRequiredFields) {
      const selectFields = "firstName lastName profileIcon email timezone language location accountState";
      if (!originalUserId) {
        user = await User.findById(userId).select(selectFields);

      } else {
        user = await User.findById(originalUserId).select(selectFields);

      }

      if (!user) {
        return sendResponse({
          res,
          statusCode: 401,
          translationKey: "account_not_found",
        });
      }

      if (
        user.accountState.status === "restricted" ||
        user.accountState.status === "suspended"
      ) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "your_account_2",
        });
      }

      // Immediately convert user to a plain object for modification
      user = user.toObject();
      user.userType = user.accountState.userType;
      delete user.accountState;

      // if userType is manager then set companyOrganizer and organization Ids to request
      if (user.userType === "manager") {
        //companyOrganizer,organizations -> fetch from db
        // Fetch organizations array
        let organizations = await getOrganizationsAsStaff(userId);
        console.log("organizations",organizations );
        let organizationIds = organizations.map(org => org._id.toString());

        if (!req.query.organizations) {
          req.query.organizations = organizations;
        }

        if (!req.query.organizationsIds) {
          req.query.organizationsIds = organizationIds;
        }

        //company organizer id
        const companyOrganizerId = organizations.length > 0 ? organizations[0].creator.toString() : null;
        req.query.companyOrganizerId = companyOrganizerId;
        req.query.companyOrganizer = companyOrganizerId;
        user.originalUserId = user._id; // Store original user ID for impersonation tracking
        user._id = companyOrganizerId; // Override user ID with company organizer ID for manager role

        user.userType = "organizer"; // Override userType to companyOrganizer for manager role

      }


      // Update the cache with the modified user object
      // userCache.set(userId, user);
      userCache.del(userId.toString()); // Invalidate cache to ensure fresh data on next request
    }

    // Set the locale based on user's language
    i18nConfig.setLocale(req, user.language || "en");
    req.token = token;
    req.user = user;

    // Override timezone with client-sent header if provided
    const clientTimezone = req.header("X-Timezone");
    if (clientTimezone) {
      req.user = { ...req.user, timezone: clientTimezone };
    }

    next(); // Move to the next middleware/route handler
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 401,
      translationKey: "invalid_token",
      error: error,
    });
  }
};

module.exports = auth;
