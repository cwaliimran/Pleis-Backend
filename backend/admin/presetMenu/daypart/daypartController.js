const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");
const {
  localTimeToUtcMinutes,
} = require("../../../shared/commonSchemas/operatingHours");

const DaypartService = require("./daypartService");

const normalizeDaypartTimes = ({
  isAllDay,
  startTime,
  endTime,
  timezone,
}) => {
  if (isAllDay) {
    return { startTime: null, endTime: null };
  }

  const startMinutes = localTimeToUtcMinutes(startTime, timezone);
  const endMinutes = localTimeToUtcMinutes(endTime, timezone);

  if (startMinutes == null || endMinutes == null) {
    return { error: "invalid_daypart_time_format" };
  }

  return { startTime: startMinutes, endTime: endMinutes };
};

const createDaypart = async (req, res) => {
  let {
    code,
    status = "active",
    name,
    isAllDay = false,
    startTime,
    endTime,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: ["code", "status", "name"],
    })
  )
    return;

  if (!isAllDay && (!startTime || !endTime)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "daypart_start_and_end_time_required",
    });
  }

  const times = normalizeDaypartTimes({
    isAllDay,
    startTime,
    endTime,
    timezone,
  });

  if (times.error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: times.error,
    });
  }

  const data = {
    user,
    code,
    status,
    name,
    isAllDay,
    startTime: times.startTime,
    endTime: times.endTime,
  };

  try {
    const Daypart = await DaypartService.createDaypart(data, timezone);
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
  let { name, status, isAllDay, startTime, endTime } = req.body;

  const timezone = req.user.timezone;

  const data = {
    name,
    status,
  };

  if (isAllDay !== undefined) {
    data.isAllDay = isAllDay;
  }

  if (isAllDay === true) {
    data.startTime = null;
    data.endTime = null;
  } else if (startTime !== undefined || endTime !== undefined || isAllDay === false) {
    if (!startTime || !endTime) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "daypart_start_and_end_time_required",
      });
    }

    const times = normalizeDaypartTimes({
      isAllDay: false,
      startTime,
      endTime,
      timezone,
    });

    if (times.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: times.error,
      });
    }

    data.startTime = times.startTime;
    data.endTime = times.endTime;
    data.isAllDay = false;
  }

  try {
    const updated = await DaypartService.updateDaypart(id, data, timezone);
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
