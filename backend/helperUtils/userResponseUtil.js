// helperUtils/userResponseUtil.js

const { createVerificationLink } = require("../models/UserModel");
const { convertUtcToTimezone } = require("./responseUtil");

const formatUserResponse = (
  userObject,
  token = null,
  includeFields = [],
  excludeFields = []
) => {
  const pIcon = userObject.profileIcon || null;
  const userType = userObject.accountState?.userType;

  // Construct basicInfo cleanly using conditionals
  const basicInfo = {
    _id: userObject._id,
    profileIcon: pIcon,
    firstName: userObject.firstName,
    lastName: userObject.lastName,
    email: userObject.email,
    phoneNumber: userObject.phoneNumber || "",
    language: userObject.language,
    country: userObject.country,
  };



  // Main response object
  const response = {
    basicInfo,
    accountState: {
      userType: userType || "user",
      status: userObject.accountState?.status || "active",
      verificationStatus: {
        email: userObject.verificationStatus?.email || "pending",
        phoneNumber: userObject.verificationStatus?.phoneNumber || "pending",
      },

      ...(userObject.accountState?.reason && {
        reason: userObject.accountState.reason,
      }),
    },
    metadata: {
      timezone: userObject.timezone,
      createdAt: userObject.createdAt,
      updatedAt: userObject.updatedAt,
      __v: userObject.__v,
    },
  };

  if (userType === "organizer") {
    basicInfo.organizationName = userObject.organizationName || "";
    basicInfo.companyDetails = userObject.companyDetails || null;
    //add termsAccepted to organizer
    response.accountState.termsAccepted = userObject.termsAccepted || false;
  }

  else if (userType == "staff" || userType == "manager") {
    response.organizations = userObject.organizations || [];
  }

  else if (userType == "admin") {
    // Removed location for admin userType
  }

  // Include OTP info in dev only
  if (process.env.NODE_ENV === "dev" && userObject.otpInfo && userObject.otpInfo.emailOtp.otp !== "") {
    response.otpInfo = userObject.otpInfo;
  }

  // Include email verification info in dev only
  if (process.env.NODE_ENV === "dev" && userObject.emailVerificationLink) {
    response.emailVerification = createVerificationLink(userObject.emailVerificationLink);
  }

  // Include resetToken if available
  if (userObject.resetToken) {
    response.resetToken = userObject.resetToken;
  }

  // Add token if provided
  if (token) {
    response.token = token;
  }

  // Handle includeFields
  if (includeFields.length > 0) {
    const filtered = {};
    includeFields.forEach((field) => {
      if (response[field]) {
        filtered[field] = response[field];
      }
    });
    return filtered;
  }

  // Handle excludeFields
  if (excludeFields.length > 0) {
    excludeFields.forEach((fieldPath) => {
      const [mainField, subField] = fieldPath.split(".");
      if (subField) {
        if (response[mainField]) {
          delete response[mainField][subField];
        }
      } else {
        delete response[fieldPath];
      }
    });
  }

  return response;
};

module.exports = {
  formatUserResponse,
};
