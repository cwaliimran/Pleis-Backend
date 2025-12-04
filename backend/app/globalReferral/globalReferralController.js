
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const globalReferralService = require("./globalReferralService");

const createGlobalReferral = async (req, res) => {
let {
  rewardAmount,
  type,
  minimumPurchases,
  purchaseThresholdAmount,
  expiryDate,
  status,
} = req.body;
const userId = req.user._id;
const timezone = req.user.timezone;
if (
  !validateParams(req, res, {
    rawData: [
      "rewardAmount", 
      "type", 
      "minimumPurchases",
      "expiryDate",
      "purchaseThresholdAmount",
    ],
  })
) return;

  // Timing slots validation
        expiryDate = convertTimezoneToUtc(
          expiryDate,
          timezone,
        );
  let data = {
    creator:userId,
rewardAmount,
  type,
  minimumPurchases,
  expiryDate,
  purchaseThresholdAmount,
  status,
  };
  try {
    const GlobalReferral = await globalReferralService.createGlobalReferral(data);
    if (!GlobalReferral) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "GlobalReferral_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "GlobalReferral_created_successfully",
      data: GlobalReferral,
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

const getGlobalReferrals = async (req, res) => {

  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range,type="global" } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
      console.log("Fetching global referrals");
    const { globalReferral, meta } = await globalReferralService.getGlobalReferrals({
        timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
      type
    });
console.log("GlobalReferrals",globalReferral );
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "GlobalReferrals_fetched_successfully",
      data: globalReferral,
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
const saveReferralData = async (id) => {

  try {

    const GlobalReferral = await globalReferralService.saveReferralData(id);
    if (!GlobalReferral) {
      return GlobalReferral
    }
   return GlobalReferral
  } catch (error) {
    return null
  }
};
const saveUserReferralData = async (username, ipAddress) => {

  try {

    const GlobalReferral = await globalReferralService.saveUserReferralData(username, ipAddress);
    if (!GlobalReferral) {
      return GlobalReferral
    }
   return GlobalReferral
  } catch (error) {
    return null
  }
};
const createUserReferradrecord = async (req, res) => {
  const {
username,
userId
  } = req.body;

  const userIp = req.ip;


  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: [
        "username",
        "userId"
      ],
    })
  )
    return;


  const data = {
    username,
    userIp,
    userId,
  };

  try {
    const Reservation = await globalReferralService.createUserReferradrecord(data);
    if (!Reservation) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "UserReferradrecord_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "UserReferradrecord_created_successfully",
      data: Reservation,
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
  createGlobalReferral,
  getGlobalReferrals,
  saveReferralData,
  saveUserReferralData,
  createUserReferradrecord,
  

};