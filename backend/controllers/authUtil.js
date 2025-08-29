

const { validateParams, sendResponse } = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { createOrSkipDevice } = require("../models/Devices");
const { User, USER_TYPES } = require("../models/UserModel");

const mongoose = require("mongoose");
const validator = require("validator");
const Organizations = require("../organizer/organizations/Organization");
const { FEATURE_KEYS } = require("../admin/features/Feature");
// const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
// const { registrationOtpEmailTemplate } = require("../helperUtils/emailTemplates");

// ✅ Main utility function
const registerUserUtility = async (req, res, options = {}) => {
  const {
    autoVerify = false, // true if created by admin, false if app user
  } = options;

  const {
    email,
    phoneNumber,
    profileIcon,
    userType = "user",
    firstName,
    lastName,
    organizationName,
    companyDetails,
    password,
    timezone = "Europe/Berlin",
    username,
    gender,
    dob,
    organizations = [], // multiple organizations for managers
    modules = [],
    deviceId,
    deviceType,
  } = req.body;

  let verificationStatus = "active";
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let rawData = ["firstName", "lastName", "email", "password", "userType"];
    let objectIdFields = [];

    // Adjust required fields by userType
    if (userType === "guest") verificationStatus = "active";
    if (userType === "manager") {
      rawData.push("organizations", "phoneNumber");
      objectIdFields.push("organizations");
    }
    if (userType === "user") rawData.push("dob", "gender", "username", "phoneNumber");
    if (userType === "staff") {
      rawData.push("organizations", "phoneNumber");
      objectIdFields.push("organizations");
    }
    if (userType === "organizer") {
      rawData.push("organizationName", "phoneNumber", "companyDetails");
      verificationStatus = "pending"; // Organizer starts as pending
    }

    const validationOptions = {
      rawData,
      objectIdFields,
      enumFields: { userType: USER_TYPES, modules: FEATURE_KEYS },
      minLengthFields: { password: 6 },
    };

    if (!validateParams(req, res, validationOptions)) {
      return { responseSent: true }; // ✅ Mark that response is already sent
    }

    // ✅ Validate profile icon
    if (profileIcon && profileIcon.startsWith("http")) {
      return {
        success: false,
        error: { message: "Invalid URL for profileIcon", translationKey: "url_not_accepted" },
        responseSent: false,
      };
    }

    // ✅ Admin token check for admin creation
    if (userType === "admin") {
      const adminToken = req.header("x-admin-access-token");
      if (adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
        return {
          success: false,
          error: { message: "Unauthorized to create admin", translationKey: "unauthorized_to" },
          responseSent: false,
        };
      }
    }

    // ✅ Check if email exists
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser && existingUser.verificationStatus.email === "verified") {
      return {
        success: false,
        error: { message: "Email already registered", translationKey: "email_already" },
        responseSent: false,
      };
    }

    // ✅ Validate phone number
    if (phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validator.isMobilePhone(`${phoneNumber.code}${phoneNumber.number}`, "any", { strictMode: true })
      ) {
        sendResponse({ res, statusCode: 400, translationKey: "invalid_phone" });
        return { responseSent: true };
      }

      const existingPhone = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });
      if (existingPhone) {
        return {
          success: false,
          error: { message: "Phone number already registered", translationKey: "phone_number_already" },
          responseSent: false,
        };
      }
    }

    // ✅ Validate organizations for manager/staff
    let organizationsDocs;
    if (userType == "manager" || userType == "staff") {
      if (organizations && organizations.length > 0) {
        organizationsDocs = await Organizations.find({ _id: { $in: organizations } });
        if (organizationsDocs.length !== organizations.length) {
          sendResponse({ res, statusCode: 400, translationKey: "invalid_organizations" });
          return { responseSent: true };
        }
      }
    }

    // ✅ Create or reuse user
    let user = existingUser || new User();
    Object.assign(user, {
      email,
      phoneNumber: phoneNumber || { code: "", number: "" },
      profileIcon,
      firstName,
      lastName,
      username,
      gender,
      dob,
      organizationName,
      password,
      timezone,
      accountState: { userType, status: verificationStatus },
      verificationStatus: {
        email: autoVerify ? "verified" : "pending",
        phoneNumber: "pending",
      },
      companyDetails: companyDetails || null,
    });

    // ✅ Handle organizations for staff and manager
    if (userType === "staff" && Array.isArray(organizationsDocs) && organizationsDocs.length > 0) {
      for (const orgDoc of organizationsDocs) {
        const staffIndex = orgDoc.staff?.findIndex(
          s => s.user?.toString() === user._id.toString()
        );

        if (staffIndex === -1) {
          orgDoc.staff = orgDoc.staff || [];
          orgDoc.staff.push({
            user: user._id,
            featuresAccess: Array.isArray(modules) ? modules : [],
          });
          await orgDoc.save({ session });
        } else if (Array.isArray(modules) && modules.length > 0) {
          const currentFeatures = orgDoc.staff[staffIndex].featuresAccess || [];
          const newFeatures = modules.filter(f => !currentFeatures.includes(f));
          if (newFeatures.length > 0) {
            orgDoc.staff[staffIndex].featuresAccess = [...currentFeatures, ...newFeatures];
            await orgDoc.save({ session });
          }
        }
      }
    }

    if (userType === "manager" && Array.isArray(organizationsDocs) && organizationsDocs.length > 0) {
      for (const orgDoc of organizationsDocs) {
        const existingStaff = orgDoc.staff?.find(s => s.user.toString() === user._id.toString());
        if (!existingStaff) {
          orgDoc.staff = orgDoc.staff || [];
          orgDoc.staff.push({ user: user._id });
        }
        await orgDoc.save({ session });
      }
    }

    // ✅ Generate email verification token if not auto-verified
    if (!autoVerify) {
      const tokenData = user.generateEmailVerificationToken();
      user.emailVerificationLink = tokenData.rawToken;

        // await sendEmailViaBrevo(user.email, tokenData.verificationLink);
    }

    await user.save({ session });

    // ✅ Optional device handling
    if (deviceId && deviceType) {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    await session.commitTransaction();

    const userObject = user.toJSON(user);
    const formattedResponse = formatUserResponse(userObject);

    return { success: true, user: formattedResponse, responseSent: false };
  } catch (error) {
    await session.abortTransaction();
    return {
      success: false,
      error: { message: error.message, translationKey: "registration_failed" },
      responseSent: false,
    };
  } finally {
    session.endSession();
  }
};




module.exports = { registerUserUtility };

module.exports = { registerUserUtility };