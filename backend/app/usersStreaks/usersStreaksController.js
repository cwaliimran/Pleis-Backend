const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const usersUsersStreaksService = require("./usersStreaksService");

const createUsersStreak = async (req, res) => {
  const { companyOrganizer, organization } = req.body;

  if (!validateParams(req, res, { rawData: ["companyOrganizer", "organization"], objectIdFields: ["companyOrganizer", "organization"] })) return;

  try {
    const usersStreak = await usersUsersStreaksService.createUsersStreak({
      companyOrganizer,
      organization,
      user: req.user._id,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "users_usersStreak_created_successfully",
      data: usersStreak,
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

const getUsersStreaks = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort, companyOrganizer } = req.query;

  try {
    // companyOrganizer is required to filter for specific companyOrganizer
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_is_required",
      });
    }

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { usersUsersStreaks, meta } = await usersUsersStreaksService.getUsersStreaks({
      companyOrganizer,
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_usersUsersStreaks_fetched_successfully",
      data: usersUsersStreaks,
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

const getPublicUsersStreaks = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { usersUsersStreaks, meta } = await usersUsersStreaksService.getPublicUsersStreaks({
      page,
      limit,
      keyword,
      date
    }).populate('companyOrganizer');

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_usersUsersStreaks_fetched_successfully",
      data: usersUsersStreaks,
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

const updateUsersStreak = async (req, res) => {
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
    const updated = await usersUsersStreaksService.updateUsersStreak(id, {
      visits,
      points,
      companyOrganizer,
      status,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "users_usersStreak_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_usersStreak_updated_successfully",
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

const deleteUsersStreak = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await usersUsersStreaksService.deleteUsersStreak(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "users_usersStreak_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_usersStreak_deleted_successfully",
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
  createUsersStreak,
  getUsersStreaks,
  getPublicUsersStreaks,
  updateUsersStreak,
  deleteUsersStreak,
};