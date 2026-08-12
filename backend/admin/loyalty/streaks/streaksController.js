const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");
const mongoose = require("mongoose");

const streaksService = require("./streaksService");

const createStreak = async (req, res) => {
  let {
    visits = 0,
    points = 0,
    companyOrganizer,
    status = "active",
  } = req.body;
  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }
  if (!validateParams(req, res, { rawData: ["points", "visits"] })) return;

  try {
    const streak = await streaksService.createStreak({
      visits,
      points,
      companyOrganizer,
      status,
    });
    if (streak.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: streak.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "streak_created_successfully",
      data: streak,
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

const getStreaks = async (req, res) => {
  let {  companyOrganizer } = req.query;
  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }
  try {
    //companyOrganizer is required to filter for specific company
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }


    const streak= await streaksService.getStreaks({
      companyOrganizer,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streaks_fetched_successfully",
      data: streak||{},
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getPublicStreaks = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date } = req.query;

  try {
    if (
      date &&
      !validateParams(req, res, {
        dateFields: {
          date: "YYYY-MM-DD",
        },
      })
    )
      return;

    const { streaks, meta } = await streaksService
      .getPublicStreaks({
        page,
        limit,
        keyword,
        date,
      })
      .populate("companyOrganizer");

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streaks_fetched_successfully",
      data: streaks,
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

const updateStreak = async (req, res) => {
  const { countBase, badges, companyOrganizer, status = "active" } = req.body;

  if (countBase && !["day", "week", "month"].includes(countBase)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_count_base",
    });
  }

  if (status && !["active", "inactive", "deleted"].includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_status",
    });
  }

  if (companyOrganizer && !mongoose.Types.ObjectId.isValid(companyOrganizer)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_company_organizer_id",
    });
  }

  if (badges !== undefined) {
    if (!Array.isArray(badges) || badges.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "badges_must_be_a_non_empty_array",
      });
    }

    const tierOrder = ["bronze", "silver", "gold", "platinum"];
    const invalidBadge = badges.find(
      (b) =>
        !b ||
        !tierOrder.includes(b.title) ||
        typeof b.visits !== "number" ||
        b.visits < 1,
    );

    if (invalidBadge) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_badge_data",
      });
    }

    // no duplicate badge titles
    const titles = badges.map((b) => b.title);
    if (new Set(titles).size !== titles.length) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "duplicate_badge_titles",
      });
    }

    // no duplicate visit counts
    const visitCounts = badges.map((b) => b.visits);
    if (new Set(visitCounts).size !== visitCounts.length) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "duplicate_badge_visits",
      });
    }

    // visits must increase with tier: bronze < silver < gold < platinum
    const sortedByTier = [...badges].sort(
      (a, b) => tierOrder.indexOf(a.title) - tierOrder.indexOf(b.title),
    );
    for (let i = 1; i < sortedByTier.length; i++) {
      if (sortedByTier[i].visits <= sortedByTier[i - 1].visits) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "badge_visits_must_increase_with_tier",
        });
      }
    }
  }

  try {
    const updated = await streaksService.updateStreak(
      countBase,
      badges,
      companyOrganizer,
      status,
    );

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "streak_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streak_updated_successfully",
      data: updated,
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

const deleteStreak = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await streaksService.deleteStreak(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "streak_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streak_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  createStreak,
  getStreaks,
  getPublicStreaks,
  updateStreak,
  deleteStreak,
};
