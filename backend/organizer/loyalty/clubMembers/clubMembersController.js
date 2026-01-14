const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
  parsePaginationParams,
} = require("@utils/responseUtil");

const clubMemberService = require("./clubMembersService");

// join club member
const getMembers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  let { keyword, status, date } = req.query;


  try {
    const clubMember = await clubMemberService.getMembers(page,
      limit,
      keyword,
      status,
      companyOrganizer=req.user._id,
      date);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_members_retrieved_successfully",
      data: clubMember,
    });
  } catch (error) {
    let readableMessage = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableMessage.message,
      error: readableMessage,
    });
  }
};

// leave club member
const giftPoints = async (req, res) => {
  const { user, points, notes } = req.body;
  const companyOrganizer = req.user._id;

  if (!validateParams(req, res, {
    bodyParams: [ "user"],
    objectIdFields: ["user"],
  })) return;

  try {
    const result = await clubMemberService.giftPoints(user, points, companyOrganizer, notes);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "points_gifted_successfully",
      data: result,
    });
  } catch (error) {
    let readableMessage = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableMessage.message,
      error: readableMessage,
    });
  }
};

module.exports = {
  getMembers,
  giftPoints,
};