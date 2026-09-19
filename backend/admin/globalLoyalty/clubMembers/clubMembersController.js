const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
  parsePaginationParams,
} = require("@utils/responseUtil");
const mongoose = require("mongoose");
const clubMemberService = require("./clubMembersService");

// join club member
const getMembers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  let { keyword, status, date, companyOrganizer } = req.query;

  if (
    !validateParams(req, res, {
      objectIdFields: ["companyOrganizer"],
    })
  )
    return;

  try {
    const clubMember = await clubMemberService.getMembers(
      page,
      limit,
      keyword,
      status,
      companyOrganizer,
      date,
    );
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
  const { companyOrganizer, user, points, notes } = req.body;

  if (
    !validateParams(req, res, {
      bodyParams: ["companyOrganizer", "user"],
      objectIdFields: ["companyOrganizer", "user"],
    })
  )
    return;

  try {
    const result = await clubMemberService.giftPoints(
      user,
      points,
      companyOrganizer,
      notes,
    );
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

const awardPointsAndUpdateMemberLevel = async (req, res) => {
  const { user, loyalty, globalLoyalty } = req.body;

  if (
    !validateParams(req, res, {
      bodyParams: ["user"],
      objectIdFields: ["user"],
    })
  )
    return;

  if (!loyalty && !globalLoyalty) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "loyalty_or_global_loyalty_required",
    });
  }

  // loyalty → companyOrganizer is mandatory, plus at least one of points/tier
  if (loyalty) {
    if (!mongoose.Types.ObjectId.isValid(loyalty.companyOrganizer)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "valid_company_organizer_required",
      });
    }

    if (loyalty.points === undefined && !loyalty.tier) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "loyalty_points_or_tier_required",
      });
    }

    if (
      loyalty.points !== undefined &&
      !Number.isFinite(Number(loyalty.points))
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_loyalty_points",
      });
    }

    if (loyalty.tier && !mongoose.Types.ObjectId.isValid(loyalty.tier)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_tier_id",
      });
    }
  }

  // globalLoyalty → points, status, or both
  if (globalLoyalty) {
    if (globalLoyalty.points === undefined && !globalLoyalty.status) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "global_points_or_status_required",
      });
    }

    if (
      globalLoyalty.points !== undefined &&
      !Number.isFinite(Number(globalLoyalty.points))
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_global_points",
      });
    }

    if (
      globalLoyalty.status &&
      !mongoose.Types.ObjectId.isValid(globalLoyalty.status)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_status_id",
      });
    }
  }

  try {
    const results = await clubMemberService.awardPointsAndUpdateMemberLevel({
      user,
      loyalty,
      globalLoyalty,
    });
    console.log("results", results);
    if (!results) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_loyalty_or_global_loyalty_changes",
      });
    }
    if (results === undefined) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_loyalty_or_global_loyalty_changes",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "points_awarded_and_member_level_updated_successfully",
      data: results,
    });
  } catch (error) {
    const readableMessage = getReadableErrorMessage(error);
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
  awardPointsAndUpdateMemberLevel,
  giftPoints,
};
