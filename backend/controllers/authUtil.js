

const { validateParams, sendResponse, getReadableErrorMessage } = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { createOrSkipDevice } = require("../models/Devices");
const { User, USER_TYPES } = require("../models/UserModel");

const mongoose = require("mongoose");
const Organizations = require("../commonModules/organizations/Organization");
const { FEATURE_KEYS } = require("../admin/features/Feature");
const { validatePhoneNumber } = require("../helperUtils/validationsUtil");
const { sendEmailViaMailgun } = require("../helperUtils/emailUtil");
const { registrationViaLinkEmailTemplate, registrationViaOtpEmailTemplate } = require("../helperUtils/emailTemplates");

// Main utility function
const registerUserUtility = async (req, res, options = {}) => {
  const {
    autoVerify = false, // true if created by admin, false if app user
    allowAdminCreation = true, // 🔒 internal only

  } = options;

  let {
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
    referralCode = "",
    deviceType,
    profileCompleted = true,
  } = req.body;

  let verificationStatus = "active";
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let rawData = ["firstName", "lastName", "email", "password", "userType"];
    let objectIdFields = [];
    let dateFields = {};
    // let enumFields = {};

    // Adjust required fields by userType
    if (userType === "guest") verificationStatus = "active";
    if (userType === "manager") {
      rawData.push("organizations", "phoneNumber");
      objectIdFields.push("organizations");
    }
    if (userType === "user") {
      rawData.push("dob", "gender", "username", "phoneNumber");
      dateFields = { dob: "YYYY-MM-DD" };
      enumFields = { gender: ["", "Male", "Female", "Other"] };
      profileCompleted = false;
    }
    if (userType === "staff") {
      rawData.push("organizations", "phoneNumber");
      objectIdFields.push("organizations");
    }
    if (userType === "organizer") {
      rawData.push("organizationName", "phoneNumber", "companyDetails");
      verificationStatus = "pending"; // Organizer starts as pending
    }

    const allowedUserTypes = [
      "guest",
      "user",
      "manager",
      "staff",
      "organizer",
    ];

    if (options.allowAdminCreation) {
      allowedUserTypes.push("admin");
    }


    const validationOptions = {
      rawData,
      objectIdFields,
      dateFields,
      enumFields: {
        userType: allowedUserTypes,
        modules: FEATURE_KEYS, gender: ["", "Male", "Female", "Other"]
      },
      minLengthFields: { password: 6 },
    };

    if (!validateParams(req, res, validationOptions)) {
      return { responseSent: true }; // Mark that response is already sent
    }

    // Validate profile icon
    if (profileIcon && profileIcon.startsWith("http")) {
      sendResponse({
        res,
        statusCode: 400,
        translationKey: "url_not_accepted",
        values: { field: "profileIcon" },
      });

      return { responseSent: true };
    }

    // Admin token check for guest creation
    if (userType === "guest") {
      const adminToken = req.header("x-admin-access-token");
      if (adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
        sendResponse({
          res,
          statusCode: 401,
          translationKey: "unauthorized_to_perform_this_action",
        });

        return { responseSent: true };
      }
    }

    // 🔒 ADMIN CAN ONLY BE CREATED INTERNALLY
    if (req.body.userType === "admin") {
      const adminToken = req.header("x-admin-access-token");
      if (
        !options.allowAdminCreation ||
        adminToken !== process.env.ADMIN_ACCESS_TOKEN
      ) {
        sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to_create_admin",
        });

        return { responseSent: true };
      }
    }


    // Check if email exists (deleted accounts are ignored so the email can be reused)
    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
      "accountState.status": { $ne: "deleted" },
    });
    if (existingUser && existingUser.verificationStatus.email === "verified") {
      sendResponse({
        res,
        statusCode: 400,
        translationKey: "email_already",
      });
      return { responseSent: true };
    }

    // Validate phone number
    if (phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validatePhoneNumber(`${phoneNumber.code}${phoneNumber.number}`).valid
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
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "phone_number_already",
        });
        return { responseSent: true };
      }
    }

    // Validate organizations for manager/staff
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

    // If organizer then check companyDetails.oib; it should be unique to every company
    if (userType === "organizer" && companyDetails && companyDetails.oib) {
      const query = { "companyDetails.oib": companyDetails.oib, "verificationStatus.email": "verified", "accountState.status": "active" };
      if (existingUser) {
        query._id = { $ne: existingUser._id };
      }
      const oibExists = await User.findOne(query);
      if (oibExists) {
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "oib_already_exists",
        });
        return { responseSent: true };
      }


      companyDetails.loyaltySettings = companyDetails.loyaltySettings || {};
      companyDetails.loyaltySettings.title = (companyDetails.name ? companyDetails.name + " - Loyalty Club" : "Loyalty Club");

    }

    // Create or reuse user
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
      referralCode,
      organizationName,
      password,
      timezone,
      accountState: { userType, status: verificationStatus, profileCompleted },
      verificationStatus: {
        email: autoVerify ? "verified" : "pending",
        phoneNumber: "pending",
      },
      companyDetails: companyDetails || null,
    });

    // Handle organizations for staff and manager
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

    // Generate email verification token if not auto-verified
    let emailVerificationLink = null;
    if (!autoVerify) {
      if (userType === "user") {
        //send otp
        const otp = user.generateOtp("email", user.timezone);
        const mBody = registrationViaOtpEmailTemplate(otp);
        await sendEmailViaMailgun(user.email, "Email Verification", mBody);
      } else {
        // send email verification link
        const tokenData = user.generateEmailVerificationToken();
        emailVerificationLink = tokenData.rawToken;
        user.emailVerificationLink = tokenData.rawToken;
        const mBody = registrationViaLinkEmailTemplate(tokenData.verificationLink);
        await sendEmailViaMailgun(user.email, "Email Verification", mBody);
      }
    }

    await user.save({ session });

    // Optional device handling
    if (deviceId && deviceType) {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    await session.commitTransaction();

    const userObject = user.toJSON();
    if (emailVerificationLink) {
      userObject.emailVerificationLink = emailVerificationLink;
    }
    const formattedResponse = formatUserResponse(userObject);

    return { success: true, user: formattedResponse, responseSent: false };
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
    return { responseSent: true };

  } finally {
    session.endSession();
  }
};

module.exports = { registerUserUtility };