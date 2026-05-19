const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const BadgeCategoriesService = require("./badgeCategoriesService");





const createBadgeCategories = async (req, res) => {
  try {
    const {
      title,
      description,
      icon,
      category,
      condition,
      points,
      status,
    } = req.body;

    /* ================= BASIC REQUIRED FIELDS ================= */

    if (
      !validateParams(req, res, {
        rawData: ["title", "category", "condition", "points"],
      })
    ) return;

    /* ================= TYPE CHECKS ================= */

    if (typeof title !== "string" || !title.trim()) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_title_invalid",
      });
    }

    if (typeof category !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_category_invalid",
      });
    }

    /* ================= CONDITION VALIDATION ================= */

    if (!condition || typeof condition !== "object") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_condition_required",
      });
    }

    if (!condition.type || typeof condition.type !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_condition_type_invalid",
      });
    }

    if (
      condition.value === undefined ||
      typeof condition.value !== "number" ||
      condition.value <= 0
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_condition_value_invalid",
      });
    }

    /* ================= POINTS VALIDATION ================= */

    if (
      points === undefined ||
      typeof points !== "number" ||
      points < 0
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_points_invalid",
      });
    }

    /* ================= OPTIONAL FIELDS ================= */

    if (icon && typeof icon !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_icon_invalid",
      });
    }



    /* ================= BUILD DATA ================= */

    const data = {
      title: title.trim(),
      description: description?.trim() || "",
      icon: icon || null,
      category,
      condition: {
        type: condition.type,
        value: condition.value,
      },
      points,
      status: status || "active",
    };

    /* ================= CREATE BADGE ================= */

    const badgeCategories = await BadgeCategoriesService.createBadgeCategories(data);

    if (!badgeCategories) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Badge_created_successfully",
      data: badgeCategories,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const getBadgeCategoriess = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range,sortBy,sortOrder } = req.query;
  try {
    const SORT_FIELDS = ["title", "description"];
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

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { BadgeCategoriess, meta } = await BadgeCategoriesService.getBadgeCategoriess({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
      sortBy,
      sortOrder,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "BadgeCategoriess_fetched_successfully",
      data: BadgeCategoriess,
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
const updateBadgeCategories = async (req, res) => {
  const { id } = req.params;

  let {
    title,
    description,
    icon,
    category,
    condition,
    points,
    status,
  } = req.body;

  if (!id) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "Badge_id_required",
    });
  }

  /* ================= BUILD UPDATE DATA ================= */

  const data = {};

  // ✅ title (only if provided)
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_title_invalid",
      });
    }
    data.title = title.trim();
  }

  // ✅ description (only if provided)
  if (description !== undefined) {
    if (typeof description !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_description_invalid",
      });
    }
    data.description = description.trim();
  }

  // ✅ icon (only if provided)
  if (icon !== undefined) {
    if (icon !== null && typeof icon !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_icon_invalid",
      });
    }
    data.icon = icon;
  }

  // ✅ category (only if provided)
  if (category !== undefined) {
    if (typeof category !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_category_invalid",
      });
    }
    data.category = category;
  }

  // ✅ condition (ONLY validate if condition exists)
  if (condition !== undefined) {
    if (
      typeof condition !== "object" ||
      condition === null
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_condition_invalid",
      });
    }

    // Only check type if provided
    if (condition.type !== undefined) {
      if (typeof condition.type !== "string") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Badge_condition_type_invalid",
        });
      }
    }

    // Only check value if provided
    if (condition.value !== undefined) {
      if (typeof condition.value !== "number" || condition.value <= 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Badge_condition_value_invalid",
        });
      }
    }

    data.condition = {
      ...(condition.type !== undefined && { type: condition.type }),
      ...(condition.value !== undefined && { value: condition.value }),
    };
  }

  // ✅ points (only if provided)
  if (points !== undefined) {
    if (typeof points !== "number" || points < 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_points_invalid",
      });
    }
    data.points = points;
  }

  // ✅ status (only if provided)
  if (status !== undefined) {
    if (!["active", "inactive", "deleted"].includes(status)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Badge_status_invalid",
      });
    }
    data.status = status;
  }

  /* ================= UPDATE ================= */

  try {
    const updated = await BadgeCategoriesService.updateBadgeCategories(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Badge_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Badge_updated_successfully",
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const deleteBadgeCategories = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await BadgeCategoriesService.deleteBadgeCategories(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "BadgeCategories_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "BadgeCategories_deleted_successfully",
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
  createBadgeCategories,
  getBadgeCategoriess,
  updateBadgeCategories,
  deleteBadgeCategories,

};