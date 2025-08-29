

const { validateParams, sendResponse } = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { createOrSkipDevice } = require("../models/Devices");
const { User, USER_TYPES } = require("../models/UserModel");

const mongoose = require("mongoose");
const validator = require("validator");
const { checkOrganizationExists } = require("../organizer/organizations/organizationService");
// const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
// const { registrationOtpEmailTemplate } = require("../helperUtils/emailTemplates");

// ✅ Main utility function
const registerUserUtility = async (req, res) => {
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
    adminToken,
    sendEmail = false,
    username,
    gender,
    dob,
    organization,
    modules,
  } = req.body;

  let verificationStatus = "active";
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let rawData = ["firstName", "lastName", "email", "password", "userType"];
    let objectIdFields = [];

    if (userType === "guest") verificationStatus = "active";
    if (userType === "manager") { 
      rawData.push("organization"); 
      objectIdFields.push("organization");
    }
    if (userType === "user") { rawData.push("dob", "gender", "username"); }
    if (userType === "staff") { 
      rawData.push("organization", "modules");
      objectIdFields.push("organization");
      objectIdFields.push("modules");
     }
    if (userType === "organizer") { rawData.push("organizationName", "phoneNumber", "companyDetails"); }

    const validationOptions = {
      rawData,
      objectIdFields,
      enumFields: { userType: USER_TYPES },
      minLengthFields: { password: 6 },
    };

    if (!validateParams(req, res, validationOptions)) {
      return { responseSent: true }; // ✅ Mark that response is already sent
    }

    console.log("here")
    return;

    if (profileIcon && profileIcon.startsWith("http")) {
      throw new Error("Invalid URL for profileIcon");
    }

    // ✅ Admin token check
    if (userType === "admin" && adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
      throw new Error("Unauthorized to create admin");
    }

    // ✅ Check existing email
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser && existingUser.verificationStatus.email === "verified") {
      throw new Error("Email already registered");
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
        return { responseSent: true }; // ✅ Response sent, stop further flow
      }

      const existingPhone = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });
      if (existingPhone) throw new Error("Phone number already registered");
    }

    //check if organization exists
    if (organization) {
      const exists = await checkOrganizationExists(organization);
      if (!exists) {
        sendResponse({ res, statusCode: 400, translationKey: "invalid_organization" });
        return { responseSent: true }; // ✅ Response sent, stop further flow
      }
    }

    // ✅ Create user
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
      verificationStatus: { email: "verified", phoneNumber: "pending" },
      companyDetails: companyDetails || null,
    });


    // organization,
    // modules,

    const tokenData = user.generateEmailVerificationToken();
    user.emailVerificationLink = tokenData.rawToken;
    await user.save({ session });
    await session.commitTransaction();

    const userObject = user.toJSON(user);
    const formattedResponse = formatUserResponse(userObject);

    // if (deviceId && deviceType) {
    //   createOrSkipDevice(userObject._id, deviceId, deviceType);
    // }

    return { success: true, user: formattedResponse, responseSent: false }; // ✅ No direct response here
  } catch (error) {
    // await session.abortTransaction();
    return { success: false, error: error, responseSent: false }; // ✅ Let controller handle error
  } finally {
    session.endSession();
  }
};

module.exports = { registerUserUtility };

module.exports = { registerUserUtility };