const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil.js");
const { formatUserResponse } = require("../../helperUtils/userResponseUtil.js");
const usersService = require("./usersService.js");
const { registerUserUtility } = require("../../controllers/authUtil.js");
const { User } = require("../../models/UserModel.js");
const { getOrganizationsAsStaff } = require("../organizations/organizationService.js");
const { formatOrganization } = require("../organizations/formatter/formatOrganization.js");
const { getLatestEventByOrganization } = require("../events/eventRepository.js");
const { getUserJoinedClubs, getUserJoinedClubsall } = require("../loyalty/clubMembers/clubMembersRepository.js");
const {
  getUserWallet,
  getTotalRedeemPurchases,
} = require("../../app/userWalletService/global/walletManagement/userWalletRepository.js");
const { getUserEventEngagementDetails } = require("../../app/favorites/favoriteRepository.js");
const { getTotalPurchases } = require("../ticketing/ticketingsRepository.js");
const { getTotalOrderPriceByUser } = require("../../app/menuItemsAndOrdering/orders/orderRepository.js");

const createUser = async (req, res) => {
  const result = await registerUserUtility(req, res, {
    autoVerify: true,
  });

  if (result.responseSent) return;

  if (!result.success) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: result.error.translationKey,
      error: result.error,
    });
  }

  return sendResponse({
    res,
    statusCode: 201,
    translationKey: "signup_successful",
    data: result.user,
  });
};

const getUsers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, userType, organization, company, sortBy, sortOrder } = req.query;
  const currentUser = req.user;
  const SORT_FIELDS = [
    "name",
    "userName",
    "role",
    "globalStatus",
    "status",
    "region",
    "createdAt",
    "lastLogin",
    "companyName",
  ];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy) ? "invalid_sort_by_field" : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy
      ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if (currentUser.userType === "admin") {
    // Admin can see all users
    try {
      const { users, meta } = await usersService.getAllUsers({
        page,
        limit,
        keyword,
        status,
        userType,
        organization,
        company,
        sortBy,
        sortOrder,
      });
      // Ensure toJSON method is applied to strip out sensitive data
      const sanitizedUsers = users.map((user) => {
        // Use your updated toJSON (works for docs and plain objects)
        let formattedUser = User.prototype.toJSON(user);

        if (formattedUser.organizations && Array.isArray(formattedUser.organizations)) {
          formattedUser.organizations = formattedUser.organizations.map((org) => {
            return formatOrganization(org);
          });
        }

        return formatUserResponse(formattedUser);
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "users_fetched_successfully",
        data: sanitizedUsers,
        meta,
      });
    } catch (error) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server",
        error,
      });
    }
  } else if (["manager", "organizer"].includes(currentUser.userType)) {
    // Managers and Organizers can see users they created or users in their organizations
    try {
      //only staff, manager userTypes accepted

      if (
        !validateParams(req, res, {
          enumFields: { userType: ["staff", "manager"] },
        })
      )
        return;

      // Managers and Organizers can only see users they created or users in their organizations
      const { users, meta } = await usersService.getStaff({
        page,
        limit,
        keyword,
        status,
        userType,
        currentUser,
      });

      // Filter users to only include those created by currentUser or in their organizations
      const filteredUsers = users.filter((user) => {
        if (currentUser.userType === "organizer") {
          // Organizer: users in orgs they created
          return user.organizations?.some((org) => org.creator.toString() === currentUser._id.toString());
        }

        if (currentUser.userType === "manager") {
          // Manager: users in orgs where they're listed in staff
          return user.organizations?.some((org) =>
            org.staff.some((s) => s.user.toString() === currentUser._id.toString()),
          );
        }

        return false;
      });

      // Ensure toJSON method is applied to strip out sensitive data
      const sanitizedUsers = filteredUsers.map((user) => {
        // Use your updated toJSON (works for docs and plain objects)
        let formattedUser = User.prototype.toJSON(user);

        if (formattedUser.organizations && Array.isArray(formattedUser.organizations)) {
          formattedUser.organizations = formattedUser.organizations.map((org) => {
            return formatOrganization(org);
          });
        }

        return formatUserResponse(formattedUser);
      });

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "users_fetched_successfully",
        data: sanitizedUsers,
        meta,
      });
    } catch (error) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server",
        error,
      });
    }
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const currentUser = req.user;
    // Only admin, manager, or organizer can update other users' profiles
    if (currentUser._id.toString() !== id && !["admin", "manager", "organizer"].includes(currentUser.userType)) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "unauthorized_to_perform_this_action",
      });
    }
    const result = await usersService.updateUser(req, res, { userId: id });

    if (result && result.errorCode) {
      return sendResponse({
        res,
        statusCode: result.errorCode,
        translationKey: result.message,
        values: result.field ? { field: result.field } : undefined,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_profile_updated_successfully",
      data: result,
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

const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await usersService.deleteUser(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getUserDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    let user = await usersService.getUserDetails(id);


    if (!user) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_details_not_found",
      });
    }

    let userObject = new User(user).toJSON();
    let events = [];
    let interests = {};
    let joinedClubs = [];
    let globalPoints = {};
    let eventEngagement = [];
    let totalPurchases = 0;

    if (
      user.accountState?.userType === "organizer" ||
      user.accountState?.userType === "staff" ||
      user.accountState?.userType === "manager"
    ) {
      const organizationsPromise = getOrganizationsAsStaff(user._id);
      const eventsPromise = organizationsPromise.then((orgs) => getLatestEventByOrganization(orgs));

      const [organizations, eventsData] = await Promise.all([organizationsPromise, eventsPromise]);

      userObject.organizations = Array.isArray(organizations)
        ? organizations.map((org) => formatOrganization(org))
        : [];

      events = eventsData;
    }
    if (user.accountState.userType === "user") {
      delete userObject.organizations;
      delete userObject.events;


      user
      const [
        interests_,
        joinedClubs_,
        globalPoints_,
        eventEngagementDetails_,
        totalorderPurchases_,
        toalticketPurchases_,
      ] = await Promise.all([
        usersService.getUserInterestsByUserId(user._id),
        getUserJoinedClubsall(user._id),
        getUserWallet(user._id),
        getUserEventEngagementDetails(user._id),
        getTotalOrderPriceByUser(user._id),
        getTotalPurchases(user._id),
      ]);
      interests = interests_;
      joinedClubs = joinedClubs_;
      globalPoints = globalPoints_;
      eventEngagement = eventEngagementDetails_;
      totalPurchases = totalorderPurchases_ + toalticketPurchases_;
    }

    const response = formatUserResponse(userObject);
    response.event = events[0] || {};
    response.interests = interests || {};
    response.joinedClubs = joinedClubs || [];
    response.globalPoints = globalPoints || {};
    response.eventEngagement = eventEngagement || [];
    response.totalPurchases = totalPurchases || 0;
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_fetched_successfully",
      data: response,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getUserByFilters = async (req, res) => {
  const { email, code, number } = req.query;
  const query = {};
  if (!email && !code && !number) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "at_least_one_filter_required",
    });
  }
  if (email) {
    query.email = email;
  }

  if (code && number) {
    query["phoneNumber.code"] = code;
    query["phoneNumber.number"] = number;
  }
  const user = await usersService.getUserByFilters(query);
  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "user_fetched_successfully",
    data: user,
  });
};

// Setup 2FA (get QR code)
const setupTwoFAController = async (req, res) => {
  const user = req.user;
  try {
    const result = await usersService.setupTwoFA(user._id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_setup",
      data: { qrCode: result.qrCodeDataURL },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};

// Confirm 2FA
const confirmTwoFAController = async (req, res) => {
  const user = req.user;
  const { token } = req.body;

  try {
    const { isValid, newlyEnabled } = await usersService.confirmTwoFA(user._id, token);

    if (!isValid) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_2fa_token",
      });
    }

    if (newlyEnabled) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "2fa_enabled_successfully", // First time enabling
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_verified_successfully", // Already enabled, just validated
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

// Disable 2FA
const disableTwoFAController = async (req, res) => {
  const user = req.user;
  try {
    await usersService.disableTwoFA(user._id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_disabled_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const createUserInterests = async (req, res) => {
  const { _id } = req.user;
  const { categories, venueTypes, tags } = req.body;

  if (
    !validateParams(req, res, {
      objectIdFields: ["categories", "venueTypes", "tags"],
    })
  )
    return;

  let data = {
    categories,
    venueTypes,
    tags,
  };
  try {
    const updatedUser = await usersService.updateUserInterests(_id, data);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_interests_updated_successfully",
      data: updatedUser,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getUserInterestsByUserId = async (req, res) => {
  const { _id } = req.user;

  try {
    let interests = await usersService.getUserInterestsByUserId(_id);
    if (!interests) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_interests_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_interests_fetched_successfully",
      data: interests,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  setupTwoFAController,
  confirmTwoFAController,
  disableTwoFAController,
  deleteUser,
  getUserDetails,
  createUserInterests,
  getUserInterestsByUserId,
  getUserByFilters,
};
