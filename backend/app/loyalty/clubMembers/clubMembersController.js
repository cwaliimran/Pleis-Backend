const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubMemberService = require("./clubMembersService");

// join club member
const joinClub = async (req, res) => {
  const { companyOrganizer } = req.body;
  const { _id: userId } = req.user;

  if (!validateParams(req, res, {
    bodyParams: ["companyOrganizer"],
  })) return;

  try {
    const clubMember = await clubMemberService.joinClub(userId, companyOrganizer);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_joined_successfully",
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
const leaveClub = async (req, res) => {
  const { companyOrganizer } = req.body;
  const { _id: userId } = req.user;

  if (!validateParams(req, res, {
    bodyParams: ["companyOrganizer"],
  })) return;

  try {
    const result = await clubMemberService.leaveClub(userId, companyOrganizer);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_left_successfully",
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
  joinClub,
  leaveClub,
};