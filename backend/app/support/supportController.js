// controllers/supportController.js
const SupportRequest = require("@SupportRequestModel");
const {
  sendResponse,
  validateParams,
} = require("@utils/responseUtil");
const { formatUpdate } = require("./helper/helper");
const createSupportRequest = async (req, res) => {
  const { name, email, subject, message } = req.body;
  const validationOptions = {
    rawData: ["name", "email", "subject", "message"],
  };
  if (!validateParams(req, res, validationOptions)) {
    return;
  }
  try {
    const supportRequest = new SupportRequest({
      name,
      email,
      subject,
      message,
      status: "pending", 
      user:req.user._id
    });
    await supportRequest.save();
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "support_request",
    });
  } catch (error) {
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    const translationKey = error.name === "ValidationError" 
      ? Object.values(error.errors)[0].message 
      : "internal_server";

    return sendResponse({
      res,
      statusCode,
      translationKey,
      error,
    });
  }
};
const getSupportRequest = async (req, res) => {
  try {
    // Retrieve support requests with user data attached
    const supportRequests = await SupportRequest.aggregate([
      {
        $match: {
          user: req.user._id,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user', 
          foreignField: '_id',
          pipeline: [
            { $project: { firstName: 1,lastName: 1,username: 1, email: 1, profileIcon: 1 } } 
          ],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user', 
          preserveNullAndEmptyArrays: true, 
        },
      },
      {
        $project: {
          name: 1,
          email: 1,
          subject: 1,
          message: 1,
          status: 1,
          response: 1,
          user: 1,
        },
      },
    ]);
const formattedSupportRequests = supportRequests.map(formatUpdate);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "support_request_fetched",
      data: formattedSupportRequests, 
    });
  } catch (error) {
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    const translationKey =
      error.name === "ValidationError"
        ? Object.values(error.errors)[0].message
        : "internal_server";

    return sendResponse({
      res,
      statusCode,
      translationKey,
      error,
    });
  }
};



module.exports = {
  createSupportRequest,
  getSupportRequest
};
