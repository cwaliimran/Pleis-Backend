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
const Organizations = require("../organizations/Organization.js");

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
  const { keyword, status, userType } = req.query;

  try {
    const { users, meta } = await usersService.getUsers({
      page,
      limit,
      keyword,
      status,
      userType
    });
    // Ensure toJSON method is applied to strip out sensitive data

    const sanitizedUsers = users.map(user => {
      return formatUserResponse(user.toJSON());
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_fetched_successfully",
      data: sanitizedUsers,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
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
    if (
      currentUser._id.toString() !== id &&
      !["admin", "manager", "organizer"].includes(currentUser.userType)
    ) {
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
        values: result.field ? { field: result.field } : undefined
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_profile_updated_successfully",
      data: result
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "user_profile_update_error",
      values: { errorMessage: error.message },
      error
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
      error: error.message,
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
    const userObject = new User(user).toJSON(user);

    if (user.accountState?.userType === "staff" || user.accountState?.userType === "manager") {
      // Fetch organizations where this user is staff member
      const organizations = await getOrganizationsAsStaff(user._id);

      // Format each organization response
      userObject.organizations = Array.isArray(organizations)
        ? organizations.map(org => {
          return Organizations.prototype.formatResponse(org);
        })
        : [];
    }


    // Format the user response using the utility function
    const response = formatUserResponse(userObject);


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
      error: error.message,
    });
  }
};


/**
 * Enable or Disable 2FA
 */
const toggleTwoFA = async (req, res) => {
  const user = req.user;
  const { enable } = req.body;

  if (typeof enable !== "boolean") {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_request_data",
    });
  }

  try {
    const result = await usersService.toggleTwoFA(user._id, {
      enable,
      email: user.email,
    });
    if (enable) {
      return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_enabled_successfully",
      data: { qrCode: result.qrCodeDataURL },
      });
    } else {
      return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_disabled_successfully",
      });
    }
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

/**
 * Verify 2FA token
 */
const verifyTwoFA = async (req, res) => {
  const user = req.user;
  const { token } = req.body;

  if (!token) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "token_required",
    });
  }

  try {
    const isValid = await usersService.verifyTwoFA(user._id, token);
    if (!isValid) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_2fa_token",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "2fa_verified_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  toggleTwoFA,
  verifyTwoFA,
  deleteUser,
  getUserDetails
};
