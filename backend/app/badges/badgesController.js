const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { menuItemOrderFormatter, badgesResponseFormatter } = require("./formater/helper");
const BadgesService = require("./badgesService");
const addUserBadges = async (req, res) => {
  const {
    userId,
    badageId
  } = req.body;
  if (
    !validateParams(req, res, {
      rawData: [
        "userId",
        "badageId",
      ],
    })
  )
    return;


  const data = {
    userId,
    badageId,
  };

  try {
    const Badges = await BadgesService.addUserBadges(data);
    if (!Badges) {
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
      data: Badges,
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
const getBadgess = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "active", date,} = req.query;
  try {

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { badges, meta } = await BadgesService.getBadgess({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
    });
const formateUser= badgesResponseFormatter(badges);
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

const detailBadgess = async (req, res) => {
const { id} = req.params;
  
 if (

    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  try {
    const badges = await BadgesService.detailBadgess(id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friend_requests_fetched_successfully",
      data: badges,
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
addUserBadges,
getBadgess,
detailBadgess
};