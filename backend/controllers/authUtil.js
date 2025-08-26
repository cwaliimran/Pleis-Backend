

const { formatUserResponse } = require("../helperUtils/userResponseUtil");
const { createOrSkipDevice } = require("../models/Devices");
const { User, USER_TYPES } = require("../models/UserModel");

const mongoose = require("mongoose");
const validator = require("validator");
// const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
// const { registrationOtpEmailTemplate } = require("../helperUtils/emailTemplates");

// ✅ Main utility function
const registerUserUtility = async ({
    email,
    deviceId,
    deviceType,
    phoneNumber,
    profileIcon,
    userType = "user",
    firstName,
    lastName,
    organizationName,
    password,
    timezone = "Europe/Berlin",
    companyDetails,
    adminToken,
    sendEmail = false
}) => {
    let verificationStatus = "active";
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // ✅ Step 1: Validate inputs
        validateRequiredFields({
            email,
            password,
            deviceId,
            deviceType,
            timezone,
            userType,
            firstName,
            lastName,
            organizationName,
        }, userType);

        if (profileIcon && profileIcon.startsWith("http")) {
            throw new Error("Invalid URL for profileIcon");
        }

        validatePhoneNumber(phoneNumber);

        // ✅ Step 2: Check for existing user/email/phone
        const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
        if (existingEmail && existingEmail.verificationStatus.email === "verified") {
            throw new Error("Email already registered");
        }

        if (phoneNumber) {
            const existingPhone = await User.findOne({
                "phoneNumber.code": phoneNumber.code,
                "phoneNumber.number": phoneNumber.number,
                "verificationStatus.phoneNumber": "verified",
            });
            if (existingPhone) throw new Error("Phone number already registered");
        }

        // ✅ Step 3: Check for admin creation restriction
        let finalUserType = userType;
        if (userType === "admin") {
            if (adminToken !== process.env.ADMIN_ACCESS_TOKEN) {
                throw new Error("Unauthorized to create admin");
            }
        }

        // ✅ Step 4: Create or update user
        let user = existingEmail || new User();
        Object.assign(user, {
            email,
            phoneNumber: phoneNumber || { code: "", number: "" },
            deviceId,
            deviceType,
            profileIcon,
            firstName,
            lastName,
            organizationName,
            password,
            timezone,
            accountState: { userType: finalUserType, status: verificationStatus },
            verificationStatus: {email: "verified", phoneNumber: "pending"},
            companyDetails: companyDetails || null,
        });


        // ✅ Step 5: Generate token and save
        const tokenData = user.generateEmailVerificationToken();
        user.emailVerificationLink = tokenData.rawToken;
        await user.save({ session });

        /*   // ✅ Step 6: Send email (if enabled)
          if (sendEmail) {
            const subject = "Welcome! Verify Your Email";
            const body = registrationOtpEmailTemplate(tokenData.verificationLink);
            await sendEmailViaBrevo([email], subject, body);
          } */

        await session.commitTransaction();

        // ✅ Step 7: Format response
        const userObject = user.toJSON(user);
        const formattedResponse = formatUserResponse(userObject);

        // ✅ Save device info asynchronously
        if (deviceId && deviceType) {
            createOrSkipDevice(userObject._id, deviceId, deviceType);
        }

        return { success: true, user: formattedResponse };
    } catch (error) {
        await session.abortTransaction();
        return { success: false, error: error };
    } finally {
        session.endSession();
    }
}

module.exports = { registerUserUtility };


// ✅ Helper: Validate required fields
function validateRequiredFields(fields, userType) {
    const required = ["firstName", "lastName", "email", "password", "timezone", "userType"];
    if (userType === "organizer") required.push("organizationName");

    for (const key of required) {
        if (!fields[key]) throw new Error(`${key} is required`);
    }

    if (fields.password.length < 6) throw new Error("Password must be at least 6 characters long");
    if (!USER_TYPES.includes(fields.userType)) throw new Error("Invalid userType");
}

// ✅ Helper: Validate phone number
function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) return;
    if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validator.isMobilePhone(phoneNumber.code + phoneNumber.number, "any", { strictMode: true })
    ) {
        throw new Error("Invalid phone number");
    }
}
