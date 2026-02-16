// services/userService.js
const { generateMeta, sendResponse } = require("../../helperUtils/responseUtil");
const userRepo = require("./usersRepository");
const { formatUserResponse } = require("../../helperUtils/userResponseUtil");
const { userCache } = require("../../config/nodeCache");
const { User } = require("../../models/UserModel");
const Organizations = require("@OrganizationModel");
const { default: mongoose } = require("mongoose");
const { generate2FASecret, generateQRCode, verify2FAToken } = require("./twoFactorAuth");
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { validatePhoneNumber } = require("../../helperUtils/validationsUtil");
const { accountStatusEmailTemplate } = require("../../helperUtils/emailTemplates");
const { sendEmailViaMailgun } = require("../../helperUtils/emailUtil");
const { createOrSkipDevice } = require("../../models/Devices");
const { updateCompanyLoyaltySettings } = require("../../app/loyalty/clubMembers/clubMembersRepository");
const { SubscriptionSettings } = require("@SubscriptionSettings");

const APP_NAME = "Pleis App";

const getAllUsers = async ({ page, limit, keyword, status, userType }) => {
  const query = {
    "verificationStatus.email": "verified",
    // "email": { $ne: "guest@pleis.com" }
  };
  if (status) {
    query["accountState.status"] = status;
  } else {
    query["accountState.status"] = { $ne: "deleted" };
  }
  if (keyword && keyword.trim() !== "") {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: User.schema },
      ],
      keyword
    );
    Object.assign(query, keywordMatch);
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

//to get only staff and managers
const getStaff = async ({ page, limit, keyword, status, userType, currentUser }) => {
  const query = {
    "verificationStatus.email": "verified",
    "accountState.status": status || { $ne: "deleted" },
  };

  if (keyword && keyword.trim() !== "") {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: User.schema },
      ],
      keyword
    );
    Object.assign(query, keywordMatch);
  }

  if (userType !== undefined) {
    query["accountState.userType"] = userType;
  }

  const skip = (page - 1) * limit;

  if (currentUser.userType === "manager") {
    const orgs = await Organizations.find({
      "staff.user": currentUser._id,
      status: { $ne: "deleted" },
    }).select("staff.user");


    const allowedUserIds = orgs.flatMap(org => org.staff.map(s => s.user));
    query["_id"] = { $in: allowedUserIds };

  } else if (currentUser.userType === "organizer") {
    const orgs = await Organizations.find({
      creator: currentUser._id,
      status: { $ne: "deleted" },
    }).select("staff.user creator");


    const allowedUserIds = orgs.flatMap(org => [org.creator, ...org.staff.map(s => s.user)]);
    query["_id"] = { $in: allowedUserIds };
  }

  const [users, totalFiltered] = await Promise.all([
    userRepo.getStaffWithFilters(query, skip, limit),
    userRepo.countUsers(query),
  ]);

  const meta = {
    ...generateMeta(page, limit, totalFiltered),
  };

  return { users, meta };
};


function getEndDate(pricingPlan, startDate = new Date()) {
  if (!pricingPlan || pricingPlan === "free") return null;

  const start = new Date(startDate);

  if (pricingPlan === "monthly") {
    return new Date(start.setMonth(start.getMonth() + 1));
  }
  if (pricingPlan === "yearly") {
    return new Date(start.setFullYear(start.getFullYear() + 1));
  }

  return null;
}


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
    profileCompleted,
    status,
    location,
    notifications,
    subscriptions
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const userType = user.accountState.userType;

    // Validate profileIcon
    if (profileIcon && profileIcon.startsWith("http")) {
      return { errorCode: 400, message: "url_not_accepted", field: "profileIcon" };
    }

    /*   // Check if email exists
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

    // Validate phone number if provided
    if (phoneNumber) {
      if (
        typeof phoneNumber !== "object" ||
        !phoneNumber.code ||
        !phoneNumber.number
        // !validatePhoneNumber(`${phoneNumber.code}${phoneNumber.number}`).valid
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

    // Basic field updates (only if provided)
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (profileIcon) user.profileIcon = profileIcon;
    if (timezone) user.timezone = timezone;
    if (termsAccepted !== undefined) user.termsAccepted = termsAccepted;
    if (username) user.username = username;
    if (gender) user.gender = gender;
    if (dob) user.dob = dob;
    if (status) user.accountState.status = status;
    if (profileCompleted !== undefined) user.accountState.profileCompleted = profileCompleted;
    if (location) user.location = location;
    if (notifications && typeof notifications === "object") {
      if (typeof notifications.email === "boolean") {
        user.notifications.email = notifications.email;
      }
      if (typeof notifications.push === "boolean") {
        user.notifications.push = notifications.push;
      }
    }

    // Handle organization changes for manager/staff
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

    let isLoyaltySettingsUpdated = false;
    // Check if companyDetails.loyaltySettings is updated
    if (userType === "organizer" && companyDetails && companyDetails.loyaltySettings) {
      const newLoyaltySettings = companyDetails.loyaltySettings;
      if (
        newLoyaltySettings.model !== undefined ||
        newLoyaltySettings.pointValuePercentage !== undefined
      ) {
        isLoyaltySettingsUpdated = true;
      }
    }
    // Update company details for organizer
    if (userType === "organizer" && companyDetails) {
      user.companyDetails = {
        logo: companyDetails.logo ?? user.companyDetails?.logo,
        coverImage: companyDetails.coverImage ?? user.companyDetails?.coverImage,
        description: companyDetails.description ?? user.companyDetails?.description,
        category: companyDetails.category ?? user.companyDetails?.category,
        name: companyDetails.name ?? user.companyDetails?.name,
        oib: companyDetails.oib ?? user.companyDetails?.oib,
        bankAccountNumber: companyDetails.bankAccountNumber ?? user.companyDetails?.bankAccountNumber,
        representativeName: companyDetails.representativeName ?? user.companyDetails?.representativeName,
        location: companyDetails.location ?? user.companyDetails?.location,
        suppliers: companyDetails.suppliers ?? user.companyDetails?.suppliers,

        // update loyaltySettings if provided
        loyaltySettings: {
          title: companyDetails.loyaltySettings?.title ?? user.companyDetails?.loyaltySettings?.title ?? "",
          model: companyDetails.loyaltySettings?.model ?? user.companyDetails?.loyaltySettings?.model ?? "essential",
          pointValuePercentage: companyDetails.loyaltySettings?.pointValuePercentage ?? user.companyDetails?.loyaltySettings?.pointValuePercentage ?? 0,
          linkedClubs: companyDetails.loyaltySettings?.linkedClubs ?? user.companyDetails?.loyaltySettings?.linkedClubs ?? [],
        },

      };

      if (user.companyDetails.loyaltySettings.title === "") {
        user.companyDetails.loyaltySettings.title = companyDetails.name + " - Loyalty Club" || "Loyalty Club";
      }
    }// -------------------------------------------------------------
    // SUBSCRIPTION HANDLING (Single Subscription Only)
    // -------------------------------------------------------------
    let incomingSub = null;

    // Case 1 → subscription object
    if (req.body.subscription && typeof req.body.subscription === "object") {
      incomingSub = req.body.subscription;
    }
    // Case 2 → flat fields
    else if (
      req.body.subscriptionTypes ||
      req.body.pricingPlan ||
      req.body.numberOfOrganizations ||
      req.body.totalSubscriptionAmount !== undefined ||
      req.body.subscriptionStatus
    ) {
      incomingSub = {
        subscriptionTypes: req.body.subscriptionTypes,
        pricingPlan: req.body.pricingPlan,
        numberOfOrganizations: req.body.numberOfOrganizations,
        totalSubscriptionAmount: req.body.totalSubscriptionAmount,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        status: req.body.subscriptionStatus     // user manual status override
      };
    }

    if (incomingSub) {
      const now = new Date();
      const hasExisting = !!user.subscription;

      // Fetch commission values from SubscriptionSettings model
      const subscriptionSettings = await SubscriptionSettings.findOne({});


      // Extract commissions from the settings document
      const orderingCommission = subscriptionSettings?.commissions?.orderingCommission || 0;
      const ticketingCommission = subscriptionSettings?.commissions?.ticketingCommission || 0;
      const reservationCommission = subscriptionSettings?.commissions?.reservationCommission || 0;

      // -------------------------------------------------------------
      // CASE A — CREATE NEW SUBSCRIPTION
      // -------------------------------------------------------------
      if (!hasExisting) {
        const startDate = incomingSub.startDate || Date.now();
        const pricingPlan = incomingSub.pricingPlan || "monthly";
        const systemEndDate = getEndDate(pricingPlan, startDate);

        // If user sends manual status → take it
        const manualStatus = incomingSub.status;

        const finalStatus =
          manualStatus ||
          (systemEndDate && systemEndDate < now ? "expired" : "active");

        user.subscription = {
          subscriptionTypes: incomingSub.subscriptionTypes || ["free"],
          pricingPlan,
          numberOfOrganizations: incomingSub.numberOfOrganizations || 1,
          totalSubscriptionAmount: incomingSub.totalSubscriptionAmount || 0,
          startDate,
          endDate: systemEndDate,
          status: finalStatus,

          // Only update commission if it's not already set (positive value)
          orderingCommission: user.subscription?.orderingCommission > 0 ? user.subscription.orderingCommission : (function () {
            if (orderingCommission === 0) {

            }
            return orderingCommission;
          })(),

          ticketingCommission: user.subscription?.ticketingCommission > 0 ? user.subscription.ticketingCommission : (function () {
            if (ticketingCommission === 0) {

            }
            return ticketingCommission;
          })(),

          reservationCommission: user.subscription?.reservationCommission > 0 ? user.subscription.reservationCommission : (function () {
            if (reservationCommission === 0) {

            }
            return reservationCommission;
          })()
        };
      }

      // -------------------------------------------------------------
      // CASE B — UPDATE EXISTING SUBSCRIPTION
      // -------------------------------------------------------------
      else {
        const oldSub = user.subscription;

        const typeChanged =
          incomingSub.subscriptionTypes &&
          JSON.stringify(incomingSub.subscriptionTypes.sort()) !==
          JSON.stringify(oldSub.subscriptionTypes.sort());

        const planChanged =
          incomingSub.pricingPlan &&
          incomingSub.pricingPlan !== oldSub.pricingPlan;

        const orgChanged =
          incomingSub.numberOfOrganizations &&
          incomingSub.numberOfOrganizations !== oldSub.numberOfOrganizations;

        const changed = typeChanged || planChanged || orgChanged;

        if (changed) {
          if (
            incomingSub.totalSubscriptionAmount === undefined ||
            incomingSub.totalSubscriptionAmount < 0
          ) {
            return {
              errorCode: 400,
              message: "totalSubscriptionAmount_required_when_subscription_changes"
            };
          }
        }

        // Recalc endDate if pricingPlan changed
        const newEndDate = incomingSub.pricingPlan
          ? getEndDate(incomingSub.pricingPlan, oldSub.startDate)
          : oldSub.endDate;

        // 1) System status
        const systemStatus =
          newEndDate && newEndDate < now ? "expired" : "active";

        // 2) User manual override (if provided)
        const manualStatus = incomingSub.status;

        // Final logic → manual status wins
        const finalStatus = manualStatus || systemStatus;

        user.subscription = {
          subscriptionTypes:
            incomingSub.subscriptionTypes || oldSub.subscriptionTypes,
          pricingPlan: incomingSub.pricingPlan || oldSub.pricingPlan,
          numberOfOrganizations:
            incomingSub.numberOfOrganizations ?? oldSub.numberOfOrganizations,
          totalSubscriptionAmount:
            incomingSub.totalSubscriptionAmount ?? oldSub.totalSubscriptionAmount,
          startDate: oldSub.startDate,
          endDate: newEndDate,
          status: finalStatus,

          // Only update commission if it's not already set (positive value)
          orderingCommission: oldSub.orderingCommission > 0 ? oldSub.orderingCommission : (function () {
            if (orderingCommission === 0) {

            }
            return orderingCommission;
          })(),

          ticketingCommission: oldSub.ticketingCommission > 0 ? oldSub.ticketingCommission : (function () {
            if (ticketingCommission === 0) {

            }
            return ticketingCommission;
          })(),

          reservationCommission: oldSub.reservationCommission > 0 ? oldSub.reservationCommission : (function () {
            if (reservationCommission === 0) {

            }
            return reservationCommission;
          })()
        };
      }
    }



    //if isLoyaltySettingsUpdated then update all club members' tierKey and pointValuePercentage
    //so next time when they earn points it uses correct pointValuePercentage
    if (isLoyaltySettingsUpdated) {
      const tierKey = user.companyDetails.loyaltySettings.model;
      const pointValuePercentage = user.companyDetails.loyaltySettings.pointValuePercentage;
      await updateCompanyLoyaltySettings(user._id, tierKey, pointValuePercentage);
    }



    await user.save({ session });

    /*   if(location && location.coordinates && location.coordinates.length === 2) {
        //add in location history for suggested cities
      } */

    // Device handling
    if (deviceId && deviceType) {
      createOrSkipDevice(user._id, deviceId, deviceType);
    }

    //if status is updated then send email to user
    if (status) {
      const mBody = accountStatusEmailTemplate(status, user.firstName + " " + user.lastName);
      await sendEmailViaMailgun(user.email, "Account Status", mBody);
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

const getUserDetailsForQRService = async (id) => {
  let data = await userRepo.getUserDetailsForQRRepo(id);
  // let formattedData = data?.toObject?.() ?? data;
  // formattedData = ;
  return formatUserResponse(data, null, [], ["accountState", "preferences", "metadata"]);
};


/**
 * Setup 2FA (Generate QR and Secret, but do not enable yet)
 * @param {string} userId
 * @returns {Promise<{ qrCodeDataURL: string, secret: string }>}
 */
const setupTwoFA = async (userId) => {
  const user = await userRepo.findUserById(userId, { twoFA: 1, email: 1 });

  let secret = user.twoFA?.secret;
  if (!secret) {
    const { secret: newSecret } = generate2FASecret(APP_NAME, user.email);
    secret = newSecret;

    await userRepo.updateTwoFA(userId, {
      "twoFA.secret": secret,
      "twoFA.isEnabled": false,
      "twoFA.isConfirmed": false,
    });
  }

  const otpauth = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(APP_NAME)}`;
  const qrCodeDataURL = await generateQRCode(otpauth);

  return { qrCodeDataURL, secret };
};

/**
 * Confirm 2FA (Verify token and enable)
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const confirmTwoFA = async (userId, token) => {
  const user = await userRepo.findUserById(userId, { twoFA: 1 });
  if (!user || !user.twoFA?.secret) return { isValid: false, newlyEnabled: false };

  const isValid = verify2FAToken(token, user.twoFA.secret);
  if (!isValid) {
    return { isValid: false, newlyEnabled: false };
  }

  let newlyEnabled = false;

  if (!user.twoFA.isEnabled) {
    await userRepo.updateTwoFA(userId, {
      "twoFA.isEnabled": true,
      "twoFA.isConfirmed": true,
    });
    newlyEnabled = true;
  }

  return { isValid: true, newlyEnabled };
};


/**
 * Disable 2FA
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const disableTwoFA = async (userId) => {
  await userRepo.updateTwoFA(userId, {
    "twoFA.isEnabled": false,
    "twoFA.isConfirmed": false,
  });
  return true;
};

const updateUserInterests = async (userId, data) => {
  // Update user interests in the database
  await userRepo.updateUserInterests(userId, data);
  return true;
}

const getUserInterestsByUserId = async (userId) => {
  return await userRepo.getUserInterestsByUserId(userId);
};

/* const getLoyaltyClubs = async () => {
  const clubs = await Users.find({
    status: "active",
    //organizer
    "loyaltySettings.model": { $ne: "none" }
  }).select("name loyaltySettings");

  return clubs;
};
 */

module.exports = {
  getAllUsers,
  getStaff,
  updateUser,
  deleteUser,
  getUserDetails,
  setupTwoFA,
  confirmTwoFA,
  disableTwoFA,
  updateUserInterests,
  getUserInterestsByUserId,
  getUserDetailsForQRService
};
