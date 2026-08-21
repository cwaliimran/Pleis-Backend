const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { menuItemOrderFormatter } = require("./formater/helper");
const friendRequestService = require("./friendRequestService");
const getFriends = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  // ✔ keyword stays separate
  let { keyword } = req.query;

  try {
    const timezone = req.user.timezone;
    const userId = req.user._id;

    const { users, meta } = await friendRequestService.getFriends({
      timezone,
      page,
      limit,
      keyword,
      userId,
    });
    const formateUser = menuItemOrderFormatter(users, timezone);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friends_fetched_successfully",
      data: formateUser,
      meta,
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
const createFriendRequest = async (req, res) => {
  const {
    friendUserId,
    notes
  } = req.body;

  const userId = req.user._id;
  req.body.userId = userId;

  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: [
        "friendUserId",
      ],
      notEqualFields: [
        ["userId", "friendUserId"]
      ]
    })
  )
    return;


  const data = {
    userId,
    friendUserId,
    notes,
  };

  try {
    const friendRequest = await friendRequestService.createFriendRequest(data);
    if (!friendRequest) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "friend_request_sent_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "friend_request_sent_successfully",
      data: friendRequest,
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
const getFriendRequests = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "pending", date, } = req.query;
  try {

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { requests, meta } = await friendRequestService.getFriendRequests({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
    });
    const formateUser = menuItemOrderFormatter(requests, timezone);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_requests_fetched_successfully",
      data: formateUser,
      meta,
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
const updateFriendRequests = async (req, res) => {
  const { id } = req.params;

  let { status} = req.body;

  try {
    const validActions = ["accept", "reject", "cancel"];
    if (!validActions.includes(status)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_friend_request_action", // Translation key for invalid action

      });
    }

    if (
      !validateParams(req, res, {
        pathParams: ["id"],
        objectIdFields: ["id"],
      })
    )
      return;
    const userId = req.user._id;

    const { requests, meta } = await friendRequestService.updateFriendRequests({
      id, status, userId
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_requests_fetched_successfully",
      data: requests,
      meta,
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
const unfriend = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const userId = req.user._id;
  try {
    const deleted = await friendRequestService.unfriend(id, userId);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "friend_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_deleted_successfully",
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
const getSentFriendRequests = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "pending", date, } = req.query;
  try {

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { requests, meta } = await friendRequestService.getSentFriendRequests({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
    });
    const formateUser = menuItemOrderFormatter(requests, timezone);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_requests_fetched_successfully",
      data: formateUser,
      meta,
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

const seeFriends = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "accept", date, } = req.query;
  try {

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { requests, meta } = await friendRequestService.seeFriends({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
    });
    const formateUser = menuItemOrderFormatter(requests, timezone);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_requests_fetched_successfully",
      data: formateUser,
      meta,
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
module.exports = {
  getFriends,
  createFriendRequest,
  getFriendRequests,
  updateFriendRequests,
  unfriend,
  getSentFriendRequests,
  seeFriends
};