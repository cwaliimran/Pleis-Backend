
const {
  sendResponse,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const friendsSuggestion = require("./friendsSuggestionService");
const {splitPhoneNumbers} = require("./formater/splitnumberToCountryCode");
const getFriendSuggestions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const timezone = req.user.timezone;
    const userId = req.user._id;
    const { users, meta } = await friendsSuggestion.getFriendSuggestions({
      timezone,
      page,
      limit, 
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


const addContacts = async (req, res) => {
  let { phoneNumbers } = req.body;
  try {
    const timezone = req.user.timezone;
    const userId = req.user._id;
    const userContacts = await friendsSuggestion.addContacts({
      phoneNumbers,  
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "friends_fetched_successfully",
      data: userContacts
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
addContacts,
getFriendSuggestions
};