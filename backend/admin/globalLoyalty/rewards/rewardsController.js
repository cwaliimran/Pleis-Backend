const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./rewardsService");

const create = async (req, res) => {
  // Initialize the fields for raw data, date fields, and objectId fields
  var dateFields = {};
  var rawData = [
    "image",
    "title",
    "rewardType",
    "category",
    "minPointsRequiredToClaim",
  ];

  // No companyOrganizer anymore
  var objectIdFields = [];


let rewardType = req.body.rewardType;
// -------------------------
// STEP 3: Add required fields based on rewardType
// -------------------------
if (rewardType === "globalTicketReward") {
  rawData.push("event");
  rawData.push("ticket");
  objectIdFields.push("event");
}



// -------------------------
// STEP 4: Final validation after mapping
// -------------------------
if (
  !validateParams(req, res, {
    rawData,
    dateFields,
    objectIdFields,
    enumFields: {
      rewardType: ["globalTicketReward", "globalCustomReward"],
    },
  })
) {
  return;
}


  try {
    // Create reward
    const response = await service.create(req.body);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "reward_created_successfully",
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
  const { keyword, status, date } = req.query;

  try {
    const { responses, meta } = await service.get({

      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
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
  try {
    const response = await service.getDetails(req.params.id);
    if (!response) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_details_fetched_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const update = async (req, res) => {
  // -------------------------------------
  // STEP 1: Validate ID
  // -------------------------------------
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] }))
    return;

  try {
    // -------------------------------------
    // STEP 2: Validate USER INPUT rewardType
    // Only if rewardType is provided
    // -------------------------------------
if (req.body.rewardType) {
  if (
    !validateParams(req, res, {
      rawData: ["rewardType"],
      enumFields: {
        rewardType: ["globalTicketReward", "globalCustomReward"],
      },
    })
  ) {
    return;
  }

  // STEP 3: Map rewardType -> globalRewardType
  if (req.body.rewardType === "globalTicketReward") {
    req.body.globalRewardType = "globalTicketReward";
  }

  if (req.body.rewardType === "globalCustomReward") {
    req.body.globalRewardType = "globalCustomReward";
  }

  // Remove user field so it doesn't cause schema errors
  delete req.body.rewardType;
}


    const updated = await service.update(req.params.id, req.body);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "reward_not_found",
      });
    }

    // -------------------------------------
    // STEP 5: Send success response
    // -------------------------------------
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_updated_successfully",
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};


const deleteItem = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await service.deleteItem(req.params.id);
    if (!deleted) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "reward_deleted_successfully" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  create,
  get,
  getDetails,
  update,
  deleteItem,
};
