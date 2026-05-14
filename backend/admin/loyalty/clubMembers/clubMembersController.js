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

  let { keyword, status, date, companyOrganizer } = req.query;
if(!companyOrganizer){
  companyOrganizer = req.user._id;
}
  if (!validateParams(req, res, {
    objectIdFields: ["companyOrganizer"],
  })) return;

  try {
    const clubMember = await clubMemberService.getMembers(page,
      limit,
      keyword,
      status,
      companyOrganizer,
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
  let { companyOrganizer, user, points, notes } = req.body;
if(req.user.userType === "organizer"){
  if(!companyOrganizer){
    companyOrganizer = req.user._id;
  } 
}
  if (!validateParams(req, res, {
    bodyParams: ["companyOrganizer", "user"],
    objectIdFields: ["companyOrganizer", "user"],
  })) return;

  try {
    const result = await clubMemberService.giftPoints(companyOrganizer, user, points, notes );
    if(result.error){
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error.message,
      });
    }
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

const calculateRewardPointsForOrganizer = async (req, res) => {
  let { companyOrganizer, itemPrice, overridePercentage = 0 } = req.body;
if(!companyOrganizer){
  companyOrganizer = req.user._id;
}

  if (!validateParams(req, res, {
    rawData: [ "itemPrice"]
  })) return;

  try {
    const points = await clubMemberService.calculateRewardPointsForOrganizerService({
      companyOrganizer,
      itemPrice,
      overridePercentage
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_points_calculated_successfully",
      data: points,
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
  calculateRewardPointsForOrganizer
};