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

const createUser = async (req, res) => {
  try {
    const result = await registerUserUtility(req, res);

    if (result.responseSent) {
      return; // ✅ Utility already handled response, stop here
    }

    if (result.success) {
      return sendResponse({
        res,
        statusCode: 201,
        translationKey: "user_created_successfully",
        data: result.user,
      });
    } else {
      const readableError = getReadableErrorMessage(result.error);
      return sendResponse({
        res,
        statusCode: readableError.statusCode,
        translationKey: readableError.message,
        error: result.error,
      });
    }
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

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
};
