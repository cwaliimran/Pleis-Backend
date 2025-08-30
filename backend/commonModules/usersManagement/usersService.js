// services/userService.js
const { generateMeta, sendResponse } = require("../../helperUtils/responseUtil");
const userRepo = require("./usersRepository");
const { formatUserResponse } = require("../../helperUtils/userResponseUtil");
const { userCache } = require("../../config/nodeCache");
const validator = require("validator");
const { User } = require("../../models/UserModel");
const Organizations = require("../organizations/Organization");
const { default: mongoose } = require("mongoose");
const { generate2FASecret, verify2FAToken } = require("./twoFactorAuth");


const getUsers = async ({ page, limit, keyword, status, userType }) => {
  const query = {
    "verificationStatus.email": "verified",
  };
  if (status) {
    query["accountState.status"] = status;
  } else {
    query["accountState.status"] = { $ne: "deleted" };
  }
  if (keyword) {
    query.$or = [{ firstName: { $regex: keyword, $options: "i" } }];
  }
  if (userType !== undefined) {
    query["accountState.userType"] = userType;
  }

  const skip = (page - 1) * limit;
  const [users, totalFiltered, pending, active, rejected, suspended] =
    await Promise.all([
      userRepo.getUsersWithFilters(
        query,
        skip,
        limit
      ),
      userRepo.countUsers(query),
      userRepo.countUsers({ "accountState.status": "pending" }),
      userRepo.countUsers({ "accountState.status": "active" }),
      userRepo.countUsers({ "accountState.status": "rejected" }),
      userRepo.countUsers({ "accountState.status": "suspended" }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.usersCount = { pending, active, rejected, suspended };
  return {
    users,
    meta,
  };
};


const updateUser = async (req, res, options = {}) => {
  const {
    userId
  } = options;
  const {
    // email,
    phoneNumber,
    profileIcon,
    firstName,
    lastName,
    organizationName,
    companyDetails,
    timezone,
    username,
    gender,
    dob,
    organizations = [],
    modules = [],
    deviceId,
    deviceType,
    termsAccepted,
    status
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const userType = user.accountState.userType;

    // ✅ Validate profileIcon
    if (profileIcon && profileIcon.startsWith("http")) {
      return { errorCode: 400, message: "url_not_accepted", field: "profileIcon" };
    }

    /*   // ✅ Check if email exists
      const existingUser = await User.findOne({ _id: { $ne: userId }, email: email.trim().toLowerCase() });
      if (existingUser && existingUser.verificationStatus.email === "verified") {
        sendResponse({
          res,
          statusCode: 400,
          translationKey: "email_already",
        });
        return { responseSent: true };
      }
   */

    // ✅ Validate phone number if provided
    if (phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number ||
        !validator.isMobilePhone(phoneNumber.code + phoneNumber.number, "any", { strictMode: true })
      ) {
        return { errorCode: 400, message: "invalid_phone" };
      }

      const existingPhone = await User.findOne({
        _id: { $ne: userId },
        "phoneNumber.code": phoneNumber.code,
        "phoneNumber.number": phoneNumber.number,
        "verificationStatus.phoneNumber": "verified"
      });

      if (existingPhone) {
        return { errorCode: 409, message: "phone_number_already" };
      }

      user.phoneNumber = phoneNumber;
      user.verificationStatus.phoneNumber = "pending";
    }

    // ✅ Basic field updates (only if provided)
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (profileIcon) user.profileIcon = profileIcon;
    if (timezone) user.timezone = timezone;
    if (termsAccepted !== undefined) user.termsAccepted = termsAccepted;
    if (username) user.username = username;
    if (gender) user.gender = gender;
    if (dob) user.dob = dob;
    if (status) user.accountState.status = status;


    // ✅ Handle organization changes for manager/staff
    if ((userType === "staff" || userType === "manager") && Array.isArray(organizations)) {
      // Find all organizations where this user is currently staff
      const currentOrgs = await Organizations.find({ "staff.user": user._id }).session(session);
      const currentOrgIds = currentOrgs.map(org => org._id.toString());
      const newOrgIds = organizations.map(id => id.toString());

      const orgsToRemove = currentOrgIds.filter(id => !newOrgIds.includes(id));
      const orgsToAdd = newOrgIds.filter(id => !currentOrgIds.includes(id));
      const orgsToUpdate = currentOrgIds.filter(id => newOrgIds.includes(id));

      // Remove user from old organizations
      if (orgsToRemove.length > 0) {
        await Organizations.updateMany(
          { _id: { $in: orgsToRemove } },
          { $pull: { staff: { user: user._id } } },
          { session }
        );
      }

      // Add user to new organizations
      if (orgsToAdd.length > 0) {
        const newOrgDocs = await Organizations.find({ _id: { $in: orgsToAdd } }).session(session);
        for (const orgDoc of newOrgDocs) {
          orgDoc.staff.push({
            user: user._id,
            featuresAccess: Array.isArray(modules) ? modules : [],
          });
          await orgDoc.save({ session });
        }
      }

      // Update modules/featuresAccess in current organizations
      if (orgsToUpdate.length > 0 && Array.isArray(modules)) {
        await Organizations.updateMany(
          { _id: { $in: orgsToUpdate }, "staff.user": user._id },
          { $set: { "staff.$.featuresAccess": modules } },
          { session }
        );
      }
    }

    if (userType === "organizer" && organizationName) {
      user.organizationName = organizationName;
    }

    // ✅ Update company details for organizer
    if (userType === "organizer" && companyDetails) {
      user.companyDetails = {
        name: companyDetails.name ?? user.companyDetails?.name,
        oib: companyDetails.oib ?? user.companyDetails?.oib,
        bankAccountNumber: companyDetails.bankAccountNumber ?? user.companyDetails?.bankAccountNumber,
        representativeName: companyDetails.representativeName ?? user.companyDetails?.representativeName,
        location: companyDetails.location ?? user.companyDetails?.location,
        suppliers: companyDetails.suppliers ?? user.companyDetails?.suppliers
      };
    }

    await user.save({ session });

    // ✅ Device handling
    if (deviceId && deviceType) {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    await session.commitTransaction();

    userCache.del(userId.toString());
    const userObject = user.toJSON();

    return formatUserResponse(userObject, null, [], ["resetToken"]);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};



const deleteUser = async (id) => {
  const updated = await userRepo.findByIdAndUpdate(id, {
    "accountState.status": "deleted",
  });
  if (!updated) return null;
  return true;
};

const getUserDetails = async (id) => {
  return await userRepo.findUserById(id);
};

/**
 * Toggle 2FA for user (enable/disable)
 * @param {string} userId
 * @param {Object} options - { enable: boolean, email?: string }
 */
const toggleTwoFA = async (userId, { enable, email }) => {
  if (enable) {
    const { secret, qrCodeDataURL } = await generate2FASecret(email);
    await userRepo.updateTwoFA(userId, {
      "twoFA.secret": secret,
      "twoFA.isEnabled": true,
    });
    return { qrCodeDataURL };
  } else {
    await userRepo.updateTwoFA(userId, {
      "twoFA.secret": null,
      "twoFA.isEnabled": false,
    });
    return true;
  }
};


/**
 * Verify 2FA token for login or setup (projects only 2FA fields)
 */
const verifyTwoFA = async (userId, token) => {
  // Only project twoFA fields
  const user = await userRepo.findUserById(userId, { twoFA: 1 });
  if (!user || !user.twoFA?.secret) return false;

  return verify2FAToken(token, user.twoFA.secret);
};




module.exports = {
  getUsers,
  updateUser,
  deleteUser,
  getUserDetails,
  toggleTwoFA,
  verifyTwoFA
};
