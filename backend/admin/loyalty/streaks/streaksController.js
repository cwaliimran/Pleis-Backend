const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const streaksService = require("./streaksService");

const createStreak = async (req, res) => {
  const { visits = 0, points = 0, companyOrganizer, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["points", "visits", "companyOrganizer"] })) return;

  try {
    const streak = await streaksService.createStreak({
      visits,
      points,
      companyOrganizer,
      status,
    });

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
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort, companyOrganizer } = req.query;

  try {

    //companyOrganizer is required to filter for specific company
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { streaks, meta } = await streaksService.getStreaks({
      companyOrganizer,
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    })

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "streaks_fetched_successfully",
      data: streaks,
      meta
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
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { streaks, meta } = await streaksService.getPublicStreaks({
      page,
      limit,
      keyword,
      date
    }).populate('companyOrganizer');

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
  const { id } = req.params;
  const { visits, points, companyOrganizer, status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await streaksService.updateStreak(id, {
      visits,
      points,
      companyOrganizer,
      status,
    });

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