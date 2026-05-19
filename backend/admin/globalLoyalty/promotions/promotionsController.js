const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./promotionsService");

const create = async (req, res) => {
  let { timezone } = req.user;
  let recurringDetails = req.body?.recurringDetails || {};
  const isRecurringEnabled = !!recurringDetails.isEnabled;

  let dateFields = {};
  let rawData = ["image", "title", "promotionType", "startDate", "endDate"];
  let objectIdFields = [];


  // ---------------- PROMOTION TYPE RULES ----------------

  // HAPPY HOUR
  if (req.body.promotionType === "globalHappyHourPromotion") {
    dateFields.startDate = "YYYY-MM-DD hh:mm A";
    dateFields.endDate = "YYYY-MM-DD hh:mm A";
    rawData.push("pointsMultiplier");
  }

  // CLAIM PROMOTION
  if (req.body.promotionType === "globalClaimPromotion") {
    dateFields.startDate = "YYYY-MM-DD";
    dateFields.endDate = "YYYY-MM-DD";
    rawData.push("reward", "claimPoints");
    objectIdFields.push("reward");
  }

  // ---------------- VALIDATION ----------------
  if (!validateParams(req, res, { rawData, dateFields, objectIdFields })) return;

  let recurringValidate = { rawData: [], dateFields: {} };

  if (recurringDetails?.isEnabled) {
    recurringValidate.rawData.push(
      "recurringDetails",
      "recurringDetails.frequency",
      "recurringDetails.interval",
      "recurringDetails.endType"
    );

    if (recurringDetails.endType === "onDate") {
      recurringValidate.dateFields["recurringDetails.endDate"] = "YYYY-MM-DD";
    }

    if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
      recurringValidate.rawData.push("recurringDetails.daysOfWeek");
    }
  }

  if (!validateParams(req, res, recurringValidate)) return;

  try {
    // ---------------- DATE CONVERSION ----------------

    const fmt =
      req.body.promotionType === "globalHappyHourPromotion"
        ? "YYYY-MM-DD hh:mm A"
        : "YYYY-MM-DD";

    if (req.body.startDate) {
      req.body.startDate = convertTimezoneToUtc(
        req.body.startDate,
        timezone,
        fmt
      );
    }

    if (req.body.endDate) {
      req.body.endDate = convertTimezoneToUtc(
        req.body.endDate,
        timezone,
        fmt
      );
    }

    // ---------------- DATE VALIDATION ----------------
    if (
      req.body.startDate &&
      req.body.endDate &&
      new Date(req.body.endDate) < new Date(req.body.startDate)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_date_cannot_be_before_start_date",
      });
    }

    // 🔑 IMPORTANT: mark this promotion as a TEMPLATE on the server
    if (isRecurringEnabled) {
      req.body.recurringMeta = {
        isTemplate: true,
        parentPromotion: null,
        occurrenceIndex: 1,
      };
    }

    // ---------------- CREATE PROMOTION ----------------
    const response = await service.create(req.body, timezone);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "promotion_created_successfully",
      data: response,
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



const get = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, sortBy, sortOrder } = req.query;

  try {
    const SORT_FIELDS = ["title", "description", "promotionType"];
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
    const { responses, meta } = await service.get({
      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
      sortBy,
      sortOrder,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotions_fetched_successfully",
      data: responses,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  let { timezone } = req.user;
  try {
    const response = await service.getDetails(req.params.id, timezone);
    if (!response) {
      return sendResponse({ res, statusCode: 404, translationKey: "promotion_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_details_fetched_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const update = async (req, res) => {
  const { scope = "single" } = req.query;
  const { timezone } = req.user;

  if (!validateParams(req, res, {
    pathParams: ["id"],
    objectIdFields: ["id"],
  })) return;

  const data = { ...req.body };

  try {
    // ---------------- FETCH EXISTING ----------------
    const existing = await service.getDetails(req.params.id, timezone);
    if (!existing) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "promotion_not_found",
      });
    }

    const isHappyHour =
      existing.promotionType === "globalHappyHourPromotion";

    // ---------------- DATE VALIDATION ----------------
    if (data.startDate || data.endDate) {
      let dateFields = {};

      if (isHappyHour) {
        if (data.startDate)
          dateFields.startDate = "YYYY-MM-DD hh:mm A";
        if (data.endDate)
          dateFields.endDate = "YYYY-MM-DD hh:mm A";
      } else {
        if (data.startDate)
          dateFields.startDate = "YYYY-MM-DD";
        if (data.endDate)
          dateFields.endDate = "YYYY-MM-DD";
      }

      if (!validateParams(req, res, { dateFields })) return;

      if (data.startDate) {
        data.startDate = convertTimezoneToUtc(
          data.startDate,
          timezone,
          isHappyHour
            ? "YYYY-MM-DD hh:mm A"
            : "YYYY-MM-DD"
        );
      }

      if (data.endDate) {
        data.endDate = convertTimezoneToUtc(
          data.endDate,
          timezone,
          isHappyHour
            ? "YYYY-MM-DD hh:mm A"
            : "YYYY-MM-DD"
        );
      }

      if (
        data.startDate &&
        data.endDate &&
        data.endDate < data.startDate
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey:
            "end_date_cannot_be_before_start_date",
        });
      }
    }

    // ---------------- RECURRING RULES ----------------
    if (data.recurringDetails?.isEnabled) {
      if (scope === "single") {
        delete data.recurringDetails;
      } else {
        const rd = data.recurringDetails;

        let validateData = {
          rawData: [
            "recurringDetails.frequency",
            "recurringDetails.interval",
            "recurringDetails.endType",
          ],
          dateFields: {},
        };

        if (rd.endType === "onDate") {
          validateData.dateFields[
            "recurringDetails.endDate"
          ] = "YYYY-MM-DD";
        }

        if (
          ["weekly", "monthly"].includes(rd.frequency)
        ) {
          validateData.rawData.push(
            "recurringDetails.daysOfWeek"
          );
        }

        if (!validateParams(req, res, validateData)) return;
      }
    }

    // ---------------- UPDATE ----------------
    const updated = await service.update(
      req.params.id,
      data,
      scope
    );

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "promotion_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey:
        "promotion_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError =
      getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};


const deleteItem = async (req, res) => {
  const { scope = "single" } = req.query;

  if (!validateParams(req, res, {
    pathParams: ["id"],
    objectIdFields: ["id"],
  })) return;

  try {
    const deleted = await service.deleteItem(
      req.params.id,
      scope
    );

    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "promotion_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey:
        "promotion_deleted_successfully",
    });
  } catch (error) {
    const readableError =
      getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};


module.exports = {
  create,
  get,
  getDetails,
  update,
  deleteItem,
};
