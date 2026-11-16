const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubService = require("./clubMembersService");
const { getSuggestedLoyaltyClubs } = require("../../organizationProfile/organizationProfileService");

// Loyalty club data-sharing consent (spec section 4): joining requires an explicit
// Accept in the app popup. Consent is per organizer and logged in the consent log.
const legalService = require("../../../commonModules/legal/legalService");
const { CONSENT_TYPES, CONSENT_ACTIONS, LOYALTY_CONSENT_VERSION, loyaltyConsentText } = require("../../../commonModules/legal/legalConstants");
const { User } = require("../../../models/UserModel");

const organizerDisplayName = async (companyOrganizer) => {
  const org = await User.findById(companyOrganizer).select("companyDetails.name firstName lastName").lean();
  return org?.companyDetails?.name || [org?.firstName, org?.lastName].filter(Boolean).join(" ") || "";
};

const logClubConsent = async (req, companyOrganizer, action) => {
  try {
    const organizerName = await organizerDisplayName(companyOrganizer);
    await legalService.logConsent({
      userId: req.user._id,
      userType: "user",
      documentType: CONSENT_TYPES.LOYALTY_CONSENT,
      action,
      documentVersion: LOYALTY_CONSENT_VERSION,
      context: {
        source: action === CONSENT_ACTIONS.WITHDRAWN ? "club_leave" : "club_join",
        clubId: String(companyOrganizer),
        organizerName,
        text: loyaltyConsentText(organizerName),
      },
      meta: legalService.requestMeta(req),
    });
  } catch (e) {
    console.error("[legal] loyalty consent log failed", e?.message);
  }
};

const joinClub = async (req, res) => {
  const { companyOrganizer, referrerId, consent } = req.body;
  const userId = req.user._id;

  if (!validateParams(req, res, { rawData: ["companyOrganizer"] })) return;

  // Decline (or an old client without the popup) => no join, no points, no sharing.
  if (consent !== true && consent !== "true") {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "loyalty_consent_required",
      data: { consentText: loyaltyConsentText(await organizerDisplayName(companyOrganizer).catch(() => "")) },
    });
  }

  try {
    const wasMember = await clubService.isClubMember(userId, companyOrganizer);
    const data = await clubService.joinClub(userId, companyOrganizer, referrerId);
    if (!wasMember) await logClubConsent(req, companyOrganizer, CONSENT_ACTIONS.ACCEPTED);

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
    const wasMember = await clubService.isClubMember(userId, companyOrganizer);
    const data = await clubService.leaveClub(userId, companyOrganizer);
    // Leaving the club = withdrawing the data-sharing consent from this moment.
    if (wasMember && data) await logClubConsent(req, companyOrganizer, CONSENT_ACTIONS.WITHDRAWN);

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
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { data, meta } = await clubService.getUserJoinedClubsWithPoints({ page, limit, userId, keyword });

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

    if (!data) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "user_company_wallet_does_not_exist",
        data,
      });
    } else {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "user_company_wallet_fetched_successfully",
        data,
      });
    }

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
    console.log("err", err)
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
