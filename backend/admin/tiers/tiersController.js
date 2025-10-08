const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const tiersService = require("./tiersService");

const createTier = async (req, res) => {
  const {
    title,
    entryPoints = 0,
    retainPoints = 0,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title"],
    })
  )
    return;

  let data = {
    title,
    entryPoints,
    retainPoints,
    status,
  };

  try {
    const tier = await tiersService.createTier(data);
    if (!tier) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "tier_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "tier_created_successfully",
      data: tier,
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

const getTiers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date } = req.query;
  try {
    const { tiers, meta } = await tiersService.getTiers({
      page,
      limit,
      keyword,
      status,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tiers_fetched_successfully",
      data: tiers,
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

const getTierDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const tier = await tiersService.getTierDetails(id);
    if (!tier) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "tier_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tier_details_fetched_successfully",
      data: tier,
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

const updateTier = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    entryPoints,
    retainPoints,
    status = "active",
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    title,
    entryPoints,
    retainPoints,
    status,
  };

  try {
    const updated = await tiersService.updateTier(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "tier_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tier_updated_successfully",
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

const deleteTier = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await tiersService.deleteTier(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "tier_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tier_deleted_successfully",
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
  createTier,
  getTiers,
  updateTier,
  deleteTier,
  getTierDetails,
};