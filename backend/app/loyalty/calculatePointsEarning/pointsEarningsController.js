const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./pointsEarningsService");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const calculatePoints = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { companyOrganizer, totalSpending } = req.body;
    const { pointsEarnings } = await service.calculatePoints({
      userId,
      companyOrganizer,
      totalSpending
    });
    // console.log("user", userId);
    // const recipientIds = Array.isArray(userId) ? userId : [userId.toString()];

    // console.log("user", recipientIds);
    // await sendUserNotifications({
    //   recipientIds: recipientIds,
    //   title: "Loyalty Points Update",
    //   body: `A new Loyalty points earning has been calculated.Go check it out!`,
    //   data: { type: NotificationTypes.HOME, objectType: "group" },
    //   senderId: userId,
    //   objectId: userId,
    // });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "loyalty_points_fetched_successfully",
      data: pointsEarnings,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  calculatePoints,
};
