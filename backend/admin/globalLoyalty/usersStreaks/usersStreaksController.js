const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const UsersStreaksService = require("./usersStreaksService");

const createUsersStreak = async (req, res) => {
  const { visits = 0, points = 0, status = "active" } = req.body;


  if (!validateParams(req, res, { rawData: ["points", "visits", "companyOrganizer"] })) return;



  try {
    const usersStreak = await UsersStreaksService.createUsersStreak({
      visits,
      points,
      companyOrganizer,
      status,

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
  const { keyword, status, date, sortBy, sortOrder } = req.query;

  try {
    const SORT_FIELDS = ["userName", "userFirstName"];
    const SORT_ORDERS = ["asc", "desc"];
    if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
      const key = sortBy && !SORT_FIELDS.includes(sortBy)
        ? "invalid_sort_by_field"
        : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }


    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { UsersStreaks, meta } = await UsersStreaksService.getUsersStreaks({

      page,
      limit,
      keyword,
      status,
      date,
      sortBy,
      sortOrder
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_streaks_fetched_successfully",
      data: UsersStreaks,
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

    const { UsersStreaks, meta } = await UsersStreaksService.getPublicUsersStreaks({
      page,
      limit,
      keyword,
      date
    }).populate('companyOrganizer');

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "users_streaks_fetched_successfully",
      data: UsersStreaks,
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
    const updated = await UsersStreaksService.updateUsersStreak(id, {
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
    const deleted = await UsersStreaksService.deleteUsersStreak(id);
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