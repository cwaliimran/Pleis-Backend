// helperUtils/userResponseUtil.js

const { createVerificationLink } = require("../models/UserModel");
const { getFullImageUrl } = require("@utils/imageHelper");


const formatUserResponse = (
  userObject,
  token = null,
  includeFields = [],
  excludeFields = []
) => {
  const pIcon = getFullImageUrl(userObject.profileIcon) || null;
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
    publicId: userObject.publicId,
  };

  // Main response object
  let response = {
    basicInfo,
    accountState: {
      twoFactorAuth: userObject.twoFA?.isEnabled || false,
      userType: userType || "user",
      status: userObject.accountState?.status || "active",
      profileCompleted: userObject.accountState?.profileCompleted || false,
      verificationStatus: {
        email: userObject.verificationStatus?.email || "pending",
        phoneNumber: userObject.verificationStatus?.phoneNumber || "pending",
      },

      ...(userObject.accountState?.reason && {
        reason: userObject.accountState.reason,
      }),
    },
    preferences: {
      notifications: {
        email: userObject.notifications?.email,
        push: userObject.notifications?.push,
      },
    },
    metadata: {
      timezone: userObject.timezone,
      createdAt: userObject.createdAt,
      updatedAt: userObject.updatedAt,
      __v: userObject.__v,
    },
  };

  if (userType == "user") {
    basicInfo.dob = userObject.dob || "";
    basicInfo.gender = userObject.gender || "";
    basicInfo.username = userObject.username || "";
    //location
    response.location = userObject.location || "";
  }

  if (userType === "organizer") {
    basicInfo.organizationName = userObject.organizationName || "";
    basicInfo.companyDetails = userObject.companyDetails || null;
    //add termsAccepted to organizer
    response.accountState.termsAccepted = userObject.termsAccepted || false;
    response.organizations = userObject.organizations || [];
  }
  else if (userType == "staff" || userType == "manager") {
    response.organizations = userObject.organizations || [];
  }

  else if (userType == "admin") {
    // Removed location for admin userType
  }

  // Include OTP info in dev only
  if ((process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "localhost") && userObject.otpInfo && userObject.otpInfo.emailOtp.otp !== "") {
    response.otpInfo = userObject.otpInfo;
  }

  // Include email verification info in dev only
  if ((process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "localhost") && userObject.emailVerificationLink) {
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
