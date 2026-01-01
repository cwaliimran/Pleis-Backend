const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubService = require("./clubMembersService");
const { getSuggestedLoyaltyClubs } = require("../../organizationProfile/organizationProfileService");

const joinClub = async (req, res) => {
  const { companyOrganizer, referrerId } = req.body;
  const userId = req.user._id;

  if (!validateParams(req, res, { rawData: ["companyOrganizer"] })) return;

  try {
    const data = await clubService.joinClub(userId, companyOrganizer,referrerId);


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
  const { page, limit, skip } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const {data, meta} = await clubService.getUserJoinedClubsWithPoints({ page, limit, skip, userId, keyword });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "user_joined_clubs_fetched_successfully",
      data,
      meta
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

const getCompanyProfileWithLoyaltyInfo = async (req, res) => {
  const { id: companyOrganizer } = req.params;
  const { _id: userId, timezone } = req.user;

  if (!validateParams(req, res, { pathParams: ["id"] })) return;

  try {
    const data = await clubService.getCompanyProfileWithLoyaltyInfo(timezone, userId, companyOrganizer);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "company_profile_with_loyalty_info_fetched_successfully",
      data,
    });

  } catch (err) {
    const readable = getReadableErrorMessage(err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readable.message,
      error: err,
    });
  }
};

const getSuggestedClubs = async (req, res) => {
  const userId = req.user._id;
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword } = req.query;

    const data = await getSuggestedLoyaltyClubs({ page, limit, userId, keyword });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "suggested_clubs_fetched_successfully",
      data: data.formatted,
      meta: data.meta
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

module.exports = {
  joinClub,
  leaveClub,
  getUserJoinedClubsWithPoints,
  getSuggestedClubs,
  getUserCompanyWallet,
  getCompanyProfileWithLoyaltyInfo
};
