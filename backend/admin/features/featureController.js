const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { Features, FEATURE_KEYS } = require("./Feature");

const featureService = require("./featureService");

const createFeature = async (req, res) => {
  let { _id: userId } = req.user;

  const {
    title = "",
    key = "",
    status = "active",
  } = req.body;

  // Validation setup
  let validateData = {
    rawData: [
      "title",
      "key",
    ],
    enumFields: {
      "key": FEATURE_KEYS,
      "status": ["active", "inactive"],
    },
  };

  if (!validateParams(req, res, validateData)) return;

  //check if key already exists
  const existingFeature = await featureService.findFeatureByQuery({ key });
  if (existingFeature) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "feature_key_already_exists",
    });
  }

  // Construct feature data per schema
  const featureData = {
    title: title.trim(),
    key: key,
    creator: userId,
    status,
  };

  try {

    const feature = await featureService.createFeature({ data: featureData });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "feature_created_successfully",
      data: feature,
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

const getFeatures = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  let { _id } = req.user;
  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    let { features, meta } = await featureService.getFeatures({
      page,
      limit,
      keyword,
      status,
      creator: _id,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "features_fetched_successfully",
      data: features,
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

const getPublicFeatures = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { features, meta } =
      await featureService.getPublicFeatures({
        page,
        limit,
        keyword,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_features_fetched_successfully",
      data: features,
      meta: generateMeta(page, limit, meta.total),
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

const updateFeature = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    title,
    key,
    status,
  } = req.body);

  // Only add fields to validateData if present in req.body
  let validateData = {
    rawData: [],
    enumFields: {},
    objectIdFields: [],
  };

  if ("title" in req.body) validateData.rawData.push("title");
  if ("key" in req.body) {
    validateData.rawData.push("key");
    validateData.enumFields["key"] = ["ticketing", "reservationManagement", "loyaltyScanning", "inAppOrdering"];
  }

  if ("status" in req.body) {
    validateData.rawData.push("status");
    validateData.enumFields["status"] = ["active", "inactive"];
  }
  if (!validateParams(req, res, validateData)) return;


  try {
    const updated = await featureService.updateFeature(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "feature_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "feature_updated_successfully",
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

const deleteFeature = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await featureService.deleteFeature(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "feature_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "feature_deleted_successfully",
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

const getFeatureDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    let feature = await featureService.findFeatureById(id);
    if (!feature) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "feature_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "feature_details_fetched_successfully",
      data: feature,
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
  createFeature,
  getFeatures,
  getPublicFeatures,
  updateFeature,
  deleteFeature,
  getFeatureDetails,
};
