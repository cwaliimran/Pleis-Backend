const { User, generateResetToken } = require("../models/UserModel");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const bcrypt = require("bcryptjs");
const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
} = require("../helperUtils/responseUtil");
const { formatUserResponse } = require("../helperUtils/userResponseUtil");
// const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
const {
  registrationOtpEmailTemplate,
  forgotPasswordOtpEmailTemplate,
} = require("../helperUtils/emailTemplates");
const { createOrSkipDevice, Devices } = require("../models/Devices");
const validator = require("validator");
const crypto = require("crypto");
//register
const register = async (req, res) => {
  const {
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
    timezone,
    companyDetails,
  } = req.body;

  let verificationStatus = "active"
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let rawData = [
      "firstName",
      "lastName",
      "email",
      "password",
      "deviceId",
      "deviceType",
      "timezone",
      "userType",
    ];

    if (userType === "organizer") {
      rawData.push("organizationName");
      verificationStatus = "pending";
    }

    const validationOptions = {
      rawData,
      enumFields: {
        userType: ["user", "organizer", "admin"],
      },
      minLengthFields: {
        password: 6, // Password must be at least 6 characters long
      },
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    //if profile icon and starts with http or https then it is a invalid url
    if (profileIcon && profileIcon.startsWith("http")) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "url_not_accepted",
        values: { field: "profileIcon" },
      });
    }

    // Validate phone number format (expects phoneNumber as { code, number })
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

    // Fetch existing user
    const existingEmail = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (existingEmail) {
      if (
        (existingEmail.email === email.trim().toLowerCase(),
        existingEmail.verificationStatus.email === "verified")
      ) {
        return sendResponse({
          res,
          statusCode: 409,
          translationKey: "email_already",
        });
      }
    }

    let existingPhone;
    if (phoneNumber) {
      existingPhone = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified",
      });
    }
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

    let existingUser = existingEmail;

    // Restrict admin creation
    let finalUserType = userType; // default to user
    if (userType === "admin") {
      const adminCreationToken = req.header("x-admin-access-token");
      if (adminCreationToken === process.env.ADMIN_ACCESS_TOKEN) {
        finalUserType = "admin";
      } else {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to",
        });
      }
    }

    let user = existingUser || new User();

    Object.assign(user, {
      email,
      phoneNumber: phoneNumber ? phoneNumber : { code: "", number: "" },
      deviceId,
      deviceType,
      profileIcon,
      firstName,
      lastName,
      organizationName,
      password,
      timezone,
      accountState: { userType: finalUserType, status: verificationStatus },
      companyDetails: companyDetails || null,
    });

    if (existingUser) {
      user.verificationStatus.email = "pending";
      user.verificationStatus.phoneNumber = "pending";
    }

    // const otp = user.generateOtp("email", user.timezone);
    const tokenData = user.generateEmailVerificationToken();
    user.emailVerificationLink = tokenData.rawToken; // Store the raw token for email verification
    await user.save({ session });

    // Send email within the transaction
    const subject = "Welcome! Verify Your Email";
    // const mBody = registrationOtpEmailTemplate(tokenData.verificationLink);
    // await sendEmailViaBrevo([email], subject, mBody);

    // Commit the transaction
    await session.commitTransaction();

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = new User(user).toJSON(user);

    // Format the user response using the utility function
    const response = formatUserResponse(userObject);

    // Save device information (not part of the transaction)
    createOrSkipDevice(userObject._id, deviceId, deviceType);

    // Send successful response with token and user data
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "signup_successful",
      data: response,
    });
  } catch (error) {
    // Only abort the transaction if it hasn't been committed yet
    await session.abortTransaction();
    // Handle validation errors from Mongoose
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    const translationKey =
      error.name === "ValidationError"
        ? Object.values(error.errors)[0].message
        : error.message;

    return sendResponse({
      res,
      statusCode,
      translationKey,
      error,
    });
  } finally {
    session.endSession(); // Ensure the session is always ended
  }
};

const companyDetails = async (req, res) => {
  const {
    name,
    oib,
    bankAccountNumber,
    representativeName,
    location,
    suppliers,
  } = req.body;

  try {
    // Find the user by id (assumes authentication middleware sets req.user)
    const user = await User.findById(req.user._id).select("companyDetails");

    if (!user.companyDetails) {
      const validationOptions = {
        rawData: [
          "name",
          "oib",
          "bankAccountNumber",
          "representativeName",
          "location",
          "suppliers",
        ],
      };
      if (!validateParams(req, res, validationOptions)) {
        return;
      }
    }

    // Update only provided company details, keep existing fields if not provided
    user.companyDetails = {
      name: name !== undefined ? name : user.companyDetails?.name,
      oib: oib !== undefined ? oib : user.companyDetails?.oib,
      bankAccountNumber:
        bankAccountNumber !== undefined
          ? bankAccountNumber
          : user.companyDetails?.bankAccountNumber,
      representativeName:
        representativeName !== undefined
          ? representativeName
          : user.companyDetails?.representativeName,
      location:
        location !== undefined ? location : user.companyDetails?.location,
      suppliers:
        suppliers !== undefined ? suppliers : user.companyDetails?.suppliers,
    };

    await user.save();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "company_details_saved",
      data: user.companyDetails,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

//login
const login = async (req, res) => {
  try {
    const { email, password, deviceId, deviceType, timezone, userType } =
      req.body;

    const validationOptions = {
      rawData: [
        "email",
        "password",
        "deviceId",
        "deviceType",
        "timezone",
        "userType",
      ],
      enumFields: {
        userType: ["user", "organizer", "admin"],
      },
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }
    let populateFields = [];

    const user = await User.findByCredentials(
      email,
      password,
      userType,
      populateFields
    );

    // Check if an error occurred
    if (user.error) {
      if (user.error === "user_not_found") {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "user_not_found", // Use your translation key for user not found
        });
      } else if (user.error === "incorrect_password") {
        return sendResponse({
          res,
          statusCode: 401,
          translationKey: "incorrect_password", // Use your translation key for incorrect password
        });
      }
    }

    // Restrict admin login
    if (user.accountState.userType === "admin") {
      const adminCreationToken = req.header("x-admin-access-token");
      if (adminCreationToken === process.env.ADMIN_ACCESS_TOKEN) {
      } else {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "unauthorized_to_1",
        });
      }
    }

    // Check the user's verification status
    const verificationStatus = user.verificationStatus["email"];
    if (verificationStatus === "pending") {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "your_account",
      });
    }

    if (
      user.accountState.status === "pending"
    ) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "pending_approval",
      });
    }

    if (
      user.accountState.status === "rejected"
    ) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "rejected_verification",
        data: {
          reason: user.accountState.reason || "No reason provided",
        }
      });
    }

    if (
      user.accountState.status === "suspended"
    ) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "your_account_2",
      });
    }


    // Check if the account is softDeleted
    if (user.accountState.status === "softDeleted") {
      const currentDate = moment();
      const finalDeletionDate = moment(user.accountState.finalDeletionDate); // Final deletion date from the user model
      const daysUntilDeletion = finalDeletionDate.diff(currentDate, "days"); // Calculate the difference in days

      if (daysUntilDeletion <= 0) {
        // Permanently delete the user account
        // Generate a random email and username
        const randomEmail = `deleted_user_${user._id}@example.com`;

        // Update the user record to anonymize it
        await User.findByIdAndUpdate(user._id, {
          $set: {
            email: randomEmail,
            firstName: `Deleted User ${user._id}`,
            lastName: ``,
            phoneNumber: { code: "", number: "" },
            profileIcon: "noimage.png",
            "accountState.status": "hardDeleted",
          },
        });

        return sendResponse({
          res,
          statusCode: 410,
          translationKey: "user_not_found",
        });
      }

      return sendResponse({
        res,
        statusCode: 423,
        translationKey: "account_deletion_warning",
        values: { daysUntilDeletion: daysUntilDeletion }, // Values to replace placeholders
      });
    }

    // Update the user's timezone
    user.timezone = timezone;

    const token = user.generateAuthToken();

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = user.toJSON();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token, [], ["resetToken"]);

    // Save device information (not part of the transaction)
    createOrSkipDevice(userObject._id, deviceId, deviceType);

    // Send successful response with token and user data
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "login_success",
      data: response,
    });
  } catch (error) {
    console.log("error:", error);
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: error,
    });
  }
};

// Generate OTP
const generateOtp = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, phoneNumber, type } = req.body;
    const validationOptions = {
      rawData: [type === "email" ? "email" : "phoneNumber"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Validate phone number format (expects phoneNumber as { code, number })
    if (
      type === "phoneNumber" &&
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

    let user;
    if (type === "email") {
      user = await User.findOne({ email: email.toLowerCase() }).select(
        "email accountState otpInfo"
      );
    } else if (type === "phoneNumber") {
      user = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
      }).select("phoneNumber accountState otpInfo");
    }

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not",
      });
    }

    // Check if account is restricted
    if (["restricted", "suspended"].includes(user.accountState.status)) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "your_account_4",
      });
    }

    const otp = user.generateOtp(type, user.timezone);

    if (otp.error) {
      if (otp.error === "too_many_otp_requests") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "too_many_otp_requests",
        });
      }
    }

    await user.save({ session });

    // Send email or SMS within the transaction
    const subject = "Password Reset OTP";
    const mBody = forgotPasswordOtpEmailTemplate(otp);
    // await sendEmailViaBrevo([email], subject, mBody);

    await session.commitTransaction();
    session.endSession();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "otp_generated",
      data: { otp },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

//Verify otp
const verifyOtp = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, phoneNumber, type, otp } = req.body;
    const validationOptions = {
      rawData: [type === "email" ? "email" : "phoneNumber"],
    };
    if (type === "email") {
      validationOptions.rawData.push("otp");
    }
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Validate phone number format if the OTP is for phone
    if (
      type === "phoneNumber" &&
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

    let user;
    if (type === "email") {
      user = await User.findOne({ email: email.toLowerCase() }).select(
        "email accountState otpInfo verificationStatus timezone"
      );
    } else if (type === "phoneNumber") {
      user = await User.findOne({
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
      }).select("phoneNumber accountState otpInfo verificationStatus timezone");
    }

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not",
      });
    }

    // Access the correct OTP based on the type (email or phone)
    const userOtpInfo =
      type === "email" ? user.otpInfo.emailOtp : user.otpInfo.phoneNumberOtp;

    if (type === "email") {
      // Check if the OTP matches
      if (userOtpInfo.otp !== otp.toString()) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_otp",
        });
      }

      // Check if the OTP has expired
      const currentTime = moment.tz(Date.now(), user.timezone).valueOf();
      if (userOtpInfo.otpExpires && userOtpInfo.otpExpires < currentTime) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "otp_has",
        });
      }
    }

    // Clear the OTP and OTP expiration after successful verification
    userOtpInfo.otp = "";
    userOtpInfo.otpExpires = "";
    userOtpInfo.otpUsed = true; // Mark OTP as used
    user.verificationStatus[type] = "verified"; // Mark verification as complete

    // Generate a password reset token (JWT or a UUID)
    const resetToken = generateResetToken(); // Function to generate a secure token
    user.resetToken = resetToken; // Save the token to the user model

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Fetch the updated user and profile icon simultaneously
    const updatedUser = await User.findById(user._id);

    // Ensure toJSON method is applied to strip out sensitive data
    const userObject = updatedUser.toJSON();

    // Generate a new auth token for the user
    const token = user.generateAuthToken();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "otp_verified",
      data: response,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error during OTP verification:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error",
      error: error,
    });
  }
};

const verifyEmailViaLink = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "missing_token",
    });
  }

  // Hash the token from the URL
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Find user by hashed token
  const user = await User.findOne({
    "emailVerification.tokenHash": tokenHash,
  });

  if (!user) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "invalid_or_expired_verification_link",
    });
  }

  const { expiresAt, used } = user.emailVerification;

  if (used) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "verification_link_already_used",
    });
  }

  if (Date.now() > expiresAt) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "verification_link_expired",
    });
  }

  // Mark verified
  user.verificationStatus.email = "verified";
  user.emailVerification.used = true;
  user.emailVerification.otpRequestCount = 0;
  await user.save();

  return res.redirect(
    process.env.EMAIL_VERIFICATION_REDIRECT_URL || "http://localhost:3000/"
  );
};

const resendEmailVerificationLink = async (req, res) => {
  try {
    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not_found",
      });
    }

    // Generate a new email verification token
    const tokenData = user.generateEmailVerificationToken();
    if (tokenData.error) {
      //too_many_verification_requests
      if (tokenData.error === "too_many_verification_requests") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "too_many_verification_requests",
        });
      }
    }

    await user.save();

    // Send the verification email
    // await sendVerificationEmail(user.email, tokenData.verificationLink);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "verification_email_sent",
      data: { verificationLink: tokenData.verificationLink },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error,
    });
  }
};

//sends link to email
const sendPasswordResetLink = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "user_not_found",
    });
  }

  const tokenData = user.generatePasswordResetToken();

  if (tokenData.error) {
    //too_many_password_reset_requests
    if (tokenData.error === "too_many_password_reset_requests") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "too_many_password_reset_requests",
      });
    }
  }

  await user.save();

  // await sendResetEmail(user.email, tokenData.resetLink);

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "password_reset_link_sent",
    data: { resetLink: tokenData.resetLink },
  });
};

// when user clicks on link from email inbox
const verifyPasswordResetLink = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "missing_token",
    });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({ "passwordReset.tokenHash": tokenHash });
  if (
    !user ||
    user.passwordReset.used ||
    Date.now() > user.passwordReset.expiresAt
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_or_expired_link",
    });
  }

  // ✅ Redirect to your frontend's reset password form
  return res.redirect(`${process.env.PASSWORD_RESET_FRONTEND_URL}${token}`);
};

//
const resetPasswordViaLink = async (req, res) => {
  const { token, newPassword } = req.body;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({ "passwordReset.tokenHash": tokenHash });
  if (
    !user ||
    user.passwordReset.used ||
    Date.now() > user.passwordReset.expiresAt
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_or_expired_link",
    });
  }

  // ✅ Set new password
  user.password = newPassword;
  user.passwordReset.used = true;
  user.passwordReset.otpRequestCount = 0;
  await user.save();

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "password_reset_successful",
  });
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;

    const validationOptions = {
      rawData: ["email", "newPassword", "resetToken"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Find the user by email
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      resetToken: resetToken,
    });

    if (!user) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_valid",
      });
    }

    // Update the password and mark OTP as used
    user.password = newPassword;
    user.otpInfo.otpUsed = true; // Mark OTP as used
    user.otpInfo.otp = ""; // Clear OTP
    user.otpInfo.otpExpires = ""; // Clear OTP expiration
    user.resetToken = ""; // Clear OTP token

    await user.save();

    // Fetch the updated user with profile icon populated and generate a token simultaneously
    const [updatedUser, token] = await Promise.all([
      User.findById(user._id),
      user.generateAuthToken(),
    ]);

    // Apply toJSON method to strip out sensitive data
    const userObject = updatedUser.toJSON();

    // Format the user response using the utility function
    const response = formatUserResponse(userObject, token);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "password_has",
      data: response,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error_1",
      error: error,
    });
  }
};

const logout = async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user._id;

    // Use $pull to remove the specific device from the devices array
    await Devices.updateOne(
      { userId: userId }, // Find the user by userId
      { $pull: { devices: { deviceId: deviceId } } } // Remove the device with matching deviceId
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "logged_out",
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: err.message,
      error: err.message,
    });
  }
};
const softDeleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Set the final deletion date to 30 days from now
    const finalDeletionDate = moment().add(30, "days").toDate();

    // Update the user's account state to softDeleted and set the finalDeletionDate
    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "accountState.status": "softDeleted",
          "accountState.finalDeletionDate": finalDeletionDate,
        },
      },
      { new: true }
    );

    await Devices.updateOne(
      { userId: userId },
      { $set: { devices: [] } } // This will empty the array of devices for the user
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "account_marked",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

const hardDeleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const email = req.user.email;

    // Generate a random email using the userId and original email
    const randomEmail = `deleted_user_${userId}_${Date.now()}@example.com`;

    // Update the user's account state to hardDeleted and set the finalDeletionDate
    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          email: randomEmail, // replace with random email
          previousEmail: email, // store the original email
          phoneNumber: { code: "", number: "" }, // clear phone number object
          profileIcon: "noimage.png",
          "accountState.status": "hardDeleted",
        },
      },
      { new: true }
    );

    await Devices.updateOne(
      { userId: userId },
      { $set: { devices: [] } } // This will empty the array of devices for the user
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "account_deleted",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

const resumeAccount = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const validationOptions = {
      rawData: ["email", "otp"],
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    // Find the user by email and OTP
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      "otpInfo.emailOtp.otp": otp.toString(),
    });

    // Check if user is found
    if (!user) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_otp_1",
      });
    }

    // Check if the OTP has expired based on user's timezone
    const currentTime = moment.tz(Date.now(), user.timezone).valueOf();

    if (
      user.otpInfo.emailOtp.otpExpires &&
      user.otpInfo.emailOtp.otpExpires < currentTime
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "otp_has",
      });
    }

    // Clear the OTP and OTP expiration after successful verification
    user.otpInfo.emailOtp.otp = "";
    user.otpInfo.emailOtp.otpExpires = "";
    user.otpInfo.emailOtp.otpUsed = true; // Mark OTP as used

    // Check if the account is marked as softDeleted
    if (user.accountState.status !== "softDeleted") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "your_account_5",
      });
    }

    // Reset the account status to active and remove the finalDeletionDate
    user.accountState.status = "active";
    user.accountState.finalDeletionDate = null;

    await user.save();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "account_resumed",
    });
  } catch (error) {
    console.error("Error during account resumption:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error_2",
      error: error,
    });
  }
};

const socialAuth = async (req, res) => {
  let {
    provider,
    socialId,
    email,
    firstName,
    lastName,
    deviceId,
    deviceType,
    timezone,
    userType,
  } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const validationOptions = {
      rawData: [
        "provider",
        "socialId",
        "firstName",
        "lastName",
        "deviceId",
        "deviceType",
        "timezone",
        "userType",
      ],
      enumFields: {
        provider: ["google", "facebook", "apple"], // Allowed values for provider
        userType: ["user", "organizer"],
      },
    };

    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    //if no email is provided, then create it from socialId
    if (!email) {
      if (provider === "google") {
        email = `${socialId}@google.com`;
      } else if (provider === "facebook") {
        email = `${socialId}@facebook.com`;
      } else if (provider === "apple") {
        email = `${socialId}@apple.com`;
      }
    }

    if (!validator.isEmail(email)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_email",
        values: { field: "email" },
      });
    }

    // Normalize email to lowercase
    email = email.trim().toLowerCase();
    // Find user by socialId or email
    let existingUser = await User.findOne({
      $or: [{ [`${provider}Id`]: socialId }, { email }],
    });

    // If user exists, update or link the social provider
    let providerLinked = false;
    if (existingUser) {
      if (existingUser.accountState.status === "suspended") {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "your_account_2",
        });
      }

      // Check if the social ID is already linked, if not, link it
      if (provider === "google" && !existingUser.googleId) {
        existingUser.googleId = socialId; // Link Google account
        providerLinked = true;
      } else if (provider === "facebook" && !existingUser.facebookId) {
        existingUser.facebookId = socialId; // Link Facebook account
        providerLinked = true;
      } else if (provider === "apple" && !existingUser.appleId) {
        existingUser.appleId = socialId; // Link Apple account
        providerLinked = true;
      }

      //if existingUser.email is not set, update it
      if (req.body.email && existingUser.email !== req.body.email) {
        existingUser.email = email; // Update the email to the one provided
        existingUser.verificationStatus.email = "verified"; // Mark email as verified
      }

      // Always update the provider and timezone, regardless of providerLinked status
      existingUser.provider = provider; // Update the provider field to reflect the latest social login
      existingUser.timezone = timezone; // Update the timezone to reflect the user's current login
      existingUser.accountState.status = "active"; // Ensure the account is active
      if (firstName !== undefined) {
        existingUser.firstName = firstName; // Update first name if provided
      }
      if (lastName !== undefined) {
        existingUser.lastName = lastName; // Update last name if provided
      }

      await existingUser.save({ session });
      const token = existingUser.generateAuthToken();

      // Ensure toJSON method is applied to strip out sensitive data
      const userObject = new User(existingUser).toJSON(existingUser);

      const response = formatUserResponse(userObject, token);

      // Save device information
      createOrSkipDevice(existingUser._id, deviceId, deviceType);

      await session.commitTransaction();
      session.endSession();

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "login_success",
        data: response,
      });
    } else {
      // If user does not exist, treat this as a signup
      const newUser = new User({
        email,
        firstName,
        lastName,
        provider, // Set the initial provider
        [`${provider}Id`]: socialId, // Dynamically store the provider ID
        timezone,
        verificationStatus: {
          email: "verified", // Mark email as verified
        },
        accountState: { userType: userType, status: "active" },
      });

      await newUser.save({ session });

      // Generate a token for the new user
      const token = newUser.generateAuthToken();

      const jUser = newUser.toJSON();
      const response = formatUserResponse(jUser, token);

      // Save device information
      createOrSkipDevice(newUser._id, deviceId, deviceType);

      await session.commitTransaction();
      session.endSession();

      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "signup_successful",
        data: response,
      });
    }
  } catch (error) {
    // Rollback transaction in case of any error
    await session.abortTransaction();
    session.endSession();
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

//check if email already exists and verified
const checkEmailExistsAndVerified = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "missing_email",
      });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("verificationStatus");
    const existsAndVerified = !!(user && user.verificationStatus.email === "verified");
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "email_check_success",
      data: { exists: existsAndVerified },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
};

//changePassword api which takes old password and new password
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const validationOptions = {
      rawData: ["oldPassword", "newPassword"],
      minLengthFields: {
        newPassword: 6, // New password must be at least 6 characters long
      },
    };
    if (!validateParams(req, res, validationOptions)) {
      return;
    }

    const user = await User.findById(req.user._id).select("password");

    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not_found",
      });
    }

    // Check if the old password is correct using bcrypt
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return sendResponse({
        res,
        statusCode: 401,
        translationKey: "incorrect_old_password",
      });
    }

    // Update the password
    user.password = newPassword;
    await user.save();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "password_changed_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "an_error_occurred",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  companyDetails,
  login,
  generateOtp,
  verifyOtp,
  verifyEmailViaLink,
  resendEmailVerificationLink,
  sendPasswordResetLink,
  verifyPasswordResetLink,
  resetPasswordViaLink,
  resetPassword,
  logout,
  hardDeleteAccount,
  softDeleteAccount,
  resumeAccount,
  socialAuth,
  checkEmailExistsAndVerified,
  changePassword
};
