const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const friendRequestService = require("./friendRequestService");
const getFriends = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  // ✔ keyword stays separate
  let { keyword, phoneNumber } = req.body;

  console.log("keyword:", keyword);
  console.log("phoneNumber:", phoneNumber);

  try {
    const timezone = req.user.timezone;
    const userId = req.user._id;

    const { users, meta } = await friendRequestService.getFriends({
      timezone,
      page,
      limit,
      keyword,            
      phoneCode: phoneNumber?.code,  
      phoneDigits: phoneNumber?.number,
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friends_fetched_successfully",
      data: users,
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
  const timezone = req.user.timezone;

  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: [
        "friendUserId",
      ],
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
  let { keyword, status = "active", date,} = req.query;
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
module.exports = {
getFriends,
createFriendRequest,
getFriendRequests,

};