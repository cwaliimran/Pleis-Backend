const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment-timezone");

const DaypartService = require("./daypartService");

const createDaypart = async (req, res) => {
  let {
    code,
    status = "active",
    name,
    isAllDay = false,
    startTime,
    endTime,
  } = req.body;
  if (isAllDay) {
    startTime = "00:00";
    endTime = "23:59";
  }
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return res
      .status(400)
      .json({ success: false, message: "Time must be in HH:mm format" });
  }
  if (toMin(endTime) <= toMin(startTime)) {
    return res
      .status(400)
      .json({ success: false, message: "endTime must be after startTime" });
  }

  const user = req.user._id;
  const timezone = req.user.timezone;
  console.log("timezone", timezone);

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "name"],
    })
  )
    return;
  const today = moment().tz(timezone).format("YYYY-MM-DD");

  if (!isAllDay) {
    startTime = convertTimezoneToUtc(
      `${today} ${startTime}`,
      timezone,
      "YYYY-MM-DD HH:mm",
      "HH:mm",
    );
    endTime = convertTimezoneToUtc(
      `${today} ${endTime}`,
      timezone,
      "YYYY-MM-DD HH:mm",
      "HH:mm",
    );
  }
  let data = {
    user,
    code,
    status,
    name,
    isAllDay,
    startTime,
    endTime,
  };
  try {
    const Daypart = await DaypartService.createDaypart(data);
    if (!Daypart) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Daypart_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Daypart_created_successfully",
      data: Daypart,
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
const getDayparts = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder, summary } = req.query;
  try {
    const user = req.user._id;
    const timezone = req.user.timezone;
    const SORT_FIELDS = ["code", "name", "createdAt", "status"];
    const SORT_ORDERS = ["asc", "desc"];
    if (
      (sortBy && !SORT_FIELDS.includes(sortBy)) ||
      (sortOrder && !SORT_ORDERS.includes(sortOrder))
    ) {
      const key =
        sortBy && !SORT_FIELDS.includes(sortBy)
          ? "invalid_sort_by_field"
          : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy
        ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }
    const { Dayparts, meta } = await DaypartService.getDayparts({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      date,
      sortBy,
      sortOrder,
      summary,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Dayparts_fetched_successfully",
      data: Dayparts,
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
const updateDaypart = async (req, res) => {
  const { id } = req.params;
  let { name, status } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    status,
  };

  try {
    const updated = await DaypartService.updateDaypart(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Daypart_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Daypart_updated_successfully",
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

const deleteDaypart = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await DaypartService.deleteDaypart(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Daypart_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Daypart_deleted_successfully",
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
const getDaypartCode = async (req, res) => {
  try {
    const code = await DaypartService.getDaypartCode();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Daypart_code_fetched_successfully",
      data: { code },
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
module.exports = {
  createDaypart,
  getDayparts,
  updateDaypart,
  deleteDaypart,
  getDaypartCode,
};
