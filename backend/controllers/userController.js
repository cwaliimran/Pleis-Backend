const { User, SubscriptionType } = require("../models/UserModel");
const moment = require("moment");
const validator = require("validator");
const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  generateMeta,
} = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { userCache } = require("../config/nodeCache");
/**
 * Dynamic population function to fetch user with populated fields.
 * @param {String} userId - The ID of the user to fetch.
 * @param {Array} fieldsToPopulate - An array of fields that need to be populated.
 * @returns {Promise<Object>} - The populated user object.
 */
const getUserProfile = async (req, res, next, fieldsToPopulate = []) => {
  try {
    const { userType, _id } = req.user;

    // Only populate suppliers if user is an organizer
    let populationFields = {};
    if (userType === "organizer") {
      populationFields.suppliers = {
        path: "companyDetails.suppliers",
        select: "title description",
      };
    }

    let query = User.findById(_id);
    // Build the dynamic population based on the fields requested
    if (fieldsToPopulate.length > 0) {
      fieldsToPopulate.forEach((field) => {
        const populationConfig = populationFields[field];
        if (populationConfig) {
          query = query.populate(
            populationConfig.path,
            populationConfig.select
          );
        }
      });
    }

    // Execute the query and return the populated user
    const user = await query.exec();

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not",
      });
    }

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = user.toJSON();

    const response = formatUserResponse(userObject, null, [], ["resetToken"]);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_fetched",
      data: response,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: `An error occurred while fetching the user: ${error.message}`,
      error,
    });
  }
};

const updateProfile = async (req, res, next) => {
  const {
    deviceId,
    deviceType,
    phoneNumber,
    profileIcon,
    firstName,
    lastName,
    organizationName,
    timezone,
  } = req.body;
  const currentUser = req.user;

  try {
    const user = await User.findById(currentUser._id);

    // Validate profileIcon: must not start with http/https
    if (profileIcon && profileIcon.startsWith("http")) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "url_not_accepted",
        values: { field: "profileIcon" },
      });
    }

    // Validate phoneNumber: expects { code, number }
    if (
      phoneNumber &&
      (typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validator.isMobilePhone(phoneNumber.code + phoneNumber.number, "any", {
          strictMode: true,
        }))
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_phone",
      });
    }

    // Update fields if provided
    if (firstName && firstName.trim() !== "") user.firstName = firstName;
    if (lastName && lastName.trim() !== "") user.lastName = lastName;
    if (deviceId) user.deviceId = deviceId;
    if (deviceType) user.deviceType = deviceType;
    if (profileIcon) user.profileIcon = profileIcon;
    if (timezone) user.timezone = timezone;
    if (phoneNumber) {
      // Check if phoneNumber is already verified and associated with someone else (exclude current user)
      const existingPhone = await User.findOne({
        _id: { $ne: currentUser._id },
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });
      if (existingPhone) {
        // Compare both code and number fields for phoneNumber object
        if (
          existingPhone.phoneNumber &&
          existingPhone.phoneNumber.code === phoneNumber.code &&
          existingPhone.phoneNumber.number === phoneNumber.number
        ) {
          return sendResponse({
            res,
            statusCode: 409,
            translationKey: "phone_number_already",
          });
        }
      }

      user.phoneNumber = phoneNumber;
      user.verificationStatus.phoneNumber = "pending"; // Reset verification status
    }
    if (currentUser.userType === "organizer" && organizationName) {
      user.organizationName = organizationName;
    }

    await user.save();

    userCache.del(currentUser._id.toString());
    const userObject = user.toJSON();

    const response = formatUserResponse(userObject, null, [], ["resetToken"]);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_profile_updated_successfully",
      data: response,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "user_profile_update_error",
      values: { errorMessage: error.message },
      error,
    });
  }
};

module.exports = {
  getUserProfile,
  updateProfile,
};
