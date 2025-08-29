const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { formatUserResponse } = require("../../helperUtils/userResponseUtil");
const usersService = require("./usersService");
const { registerUserUtility } = require("../../controllers/authUtil.js");
const { User } = require("../../models/UserModel.js");
const { getOrganizationsAsStaff } = require("../../organizer/organizations/organizationService.js");
const Organizations = require("../../organizer/organizations/Organization.js");

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
      message: result.error.message,
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
  const { title, status, pinned } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await usersService.updateUser(id, {
      title,
      status,
      pinned,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "user_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_updated_successfully",
      data: updated,
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
        translationKey: "user_not_found",
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

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserDetails
};
