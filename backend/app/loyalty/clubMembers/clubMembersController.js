const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubService = require("./clubMembersService");

const joinClub = async (req, res) => {
  const { companyOrganizer } = req.body;
  const userId = req.user._id;

  if (!validateParams(req, res, { bodyParams: ["companyOrganizer"] })) return;

  try {
    const data = await clubService.joinClub(userId, companyOrganizer);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_joined_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: readable,
    });
  }
};

const leaveClub = async (req, res) => {
  const { companyOrganizer } = req.body;
  const userId = req.user._id;

  if (!validateParams(req, res, { bodyParams: ["companyOrganizer"] })) return;

  try {
    const data = await clubService.leaveClub(userId, companyOrganizer);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_left_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: readable,
    });
  }
};

const getUserJoinedClubsWithPoints = async (req, res) => {
  const userId = req.user._id;

  try {
    const data = await clubService.getUserJoinedClubsWithPoints(userId);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_joined_clubs_fetched_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: readable,
    });
  }
}

const getUserCompanyWallet = async (req, res) => {
  const userId = req.user._id;
  const { id: companyOrganizer } = req.params;

  if (!validateParams(req, res, { pathParams: ["id"] })) return;

  try {
    const data = await clubService.getUserCompanyWallet(userId, companyOrganizer);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_company_wallet_fetched_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: readable,
    });
  }
};
const updateUserCompanyPoints = async (req, res) => {
  const { userId, companyOrganizer, pointsDelta, organization } = req.body;

  if (!validateParams(req, res, { bodyParams: ["userId", "companyOrganizer", "pointsDelta", "organization"] })) return;

  try {
    const data = await clubService.updateUserCompanyPoints({ userId, companyOrganizer, pointsDelta, organization });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_company_points_updated_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: readable,
    });
  }
};

module.exports = {
  joinClub,
  leaveClub,
  getUserJoinedClubsWithPoints,
  getUserCompanyWallet
};
