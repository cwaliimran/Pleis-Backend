const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const challengeService = require("./challengesService");

const createChallenge = async (req, res) => {

  //"visit", "earnPoints", "buyMenuItem", "referUsers"
  const taskType = req.body.taskType;
  if(!req.body.companyOrganizer){
    req.body.companyOrganizer = req.user?._id;
  }

  var dateFields = {}
  var rawData = ["title", "taskType", "reward", "endDate", "reward", "taskValue", "reward.rewardType"]
  var objectIdFields = ["companyOrganizer"]

  if (req.body.promotionType === "buyMenuItem") {
    rawData.push("menuItem")
    objectIdFields.push("menuItem")
  }


  var rewardType = req.body.reward?.rewardType || ""
  if (rewardType === "points") {
    rawData.push("reward.rewardValue")
  } else if (rewardType === "menuItem") {
    rawData.push("reward.rewardMenuItem")
    objectIdFields.push("reward.rewardMenuItem")
  } else if (rewardType === "specialTicket") {
    rawData.push("reward.specialTicket.companyOrganizer");
    rawData.push("reward.specialTicket.organization");
    rawData.push("reward.specialTicket.event");
    rawData.push("reward.specialTicket.ticket");
  } else if (rewardType === "customReward") {
    rawData.push("reward.customReward")
    rawData.push("reward.customReward.image")
    rawData.push("reward.customReward.title")
    rawData.push("reward.customReward.description")
  }

  if (!validateParams(req, res, {
    rawData,
    dateFields,
    objectIdFields,
    dateFields: {
      endDate: "YYYY-MM-DD"
    }
  })) return;


  try {
    if (req.body.endDate) {
      req.body.endDate = convertTimezoneToUtc(req.body.endDate, req.user.timezone, "YYYY-MM-DD");
    }
    const challenge = await challengeService.createChallenge(req.body);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "challenge_created_successfully",
      data: challenge,
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

const getChallenges = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, companyOrganizer } = req.query;
  if(!companyOrganizer){
    companyOrganizer = req.user?._id;
  }
  try {
    //companyOrganizer is required to filter for specific company
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }

    const { challenges, meta } = await challengeService.getChallenges({
      companyOrganizer,
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
      translationKey: "challenges_fetched_successfully",
      data: challenges,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getChallengeDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const challenge = await challengeService.getChallengeDetails(req.params.id);
    if (!challenge) {
      return sendResponse({ res, statusCode: 404, translationKey: "challenge_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_details_fetched_successfully",
      data: challenge,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const updateChallenge = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const updated = await challengeService.updateChallenge(req.params.id, req.body);
 
    if (!updated) {
      return sendResponse({ res, statusCode: 404, translationKey: "challenge_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "challenge_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const deleteChallenge = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await challengeService.deleteChallenge(req.params.id);
    if (!deleted) {
      return sendResponse({ res, statusCode: 404, translationKey: "challenge_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "challenge_deleted_successfully" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  createChallenge,
  getChallenges,
  getChallengeDetails,
  updateChallenge,
  deleteChallenge,
};
