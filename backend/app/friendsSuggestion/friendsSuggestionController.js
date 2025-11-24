
const {
  sendResponse,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const friendsSuggestion = require("./friendsSuggestionService");
const {splitPhoneNumbers} = require("./formater/splitnumberToCountryCode");
const getFriends = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { phoneNumbers } = req.body;
  console.log("phonenumbes",phoneNumbers );
  const result = splitPhoneNumbers(phoneNumbers);
console.log(result);

  try {
    const timezone = req.user.timezone;
    const userId = req.user._id;
    const { users, meta } = await friendsSuggestion.getFriends({
      timezone,
      page,
      limit,
      phoneNumbers: result,  
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friends_fetched_successfully",
      data: users,
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
module.exports = {
getFriends,
};