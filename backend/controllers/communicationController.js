// communicationController.js
const {
  sendEmailViaSgrid,
  sendEmailViaAwsSes,
  sendSmsViaPinpoint,
  sendEmailViaBrevo
} = require("../helperUtils/emailUtil");
const { Devices } = require("../models/Devices");
const { sendResponse, validateParams } = require("../helperUtils/responseUtil");
const adminFireBConfig = require("../config/firebaseAdmin"); // Firebase admin SDK setup
const {
  registrationOtpEmailTemplate,
} = require("../helperUtils/emailTemplates");
const { NotificationExp } = require("../models/Notifications");
const { Vonage } = require("@vonage/server-sdk");

/**
 * Send an email using SendGrid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendEmailSgrid = async (req, res) => {
  const { title, emails, subject, body, config } = req.body;

  // Validate required parameters
  const validationOptions = {
    bodyParams: ["title", "emails", "subject", "body"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  try {
    await sendEmailViaSgrid(title, emails, subject, body, config);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "email_sent",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.body,
      error,
    });
  }
};

/**
 * Send an email using AWS SES
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendEmailAws = async (req, res) => {
  const { title, emails, subject, body, config } = req.body;

  // Validate required parameters
  const validationOptions = {
    bodyParams: ["title", "emails", "subject", "body"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  try {
    await sendEmailViaAwsSes(emails, subject, body, config);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "email_sent",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed_to",
      error: error,
    });
  }
};
/**
 * Send an email using AWS SES
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendEmailBrevo = async (req, res) => {
  const { title, emails, subject, body, config } = req.body;
  // Validate required parameters
  const validationOptions = {
    bodyParams: ["title", "emails", "subject", "body"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  try {
    // await sendEmailViaBrevo(emails, subject, body, config);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "email_sent",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed_to",
      error: error,
    });
  }
};

const sendSmsViaPinpointAws = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  // Validate required parameters
  if (!phoneNumber || !otp) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "phone_number_1",
      error: "Phone number and OTP are required.",
    });
  }

  try {
    const otpMessage = `${otp} is your OTP for the Pleis App`;
    await sendSmsViaPinpoint(phoneNumber, otpMessage);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "otp_sent",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.body,
      error,
    });
  }
};

/**
 * Send a notification (placeholder function, can be expanded for different titles)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendNotificationControllerForTesting = async (req, res) => {
  const { recipients, title, body, data } = req.body;

  // Validate required parameters
  const validationOptions = {
    bodyParams: ["recipients", "title", "body"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  try {
    // Placeholder for notification sending logic
    // This can be expanded to handle different titles of notifications like SMS, Push, etc.
    // console.log(`Sending ${title} notification to: ${recipients.join(", ")}`);
    // console.log(`body: ${body}`);

    // Simulate sending notification
    const response = await sendNotification(recipients, {
      title: title,
      body: body,
      data: data,
    });

    const successIds = [];
    const failureIds = [];

    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        successIds.push(recipients[idx]);
      } else {
        failureIds.push({
          ...recipients[idx],
          error: resp.error ? resp.error.message : "Unknown error",
        });
      }
    });

    if (successIds.length > 0) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "notifications_sent_success", // Use the success translation key
        values: { title }, // Pass the dynamic title
        data: {
          successIds,
          failureIds,
        },
      });
    } else {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "notifications_sent_failure", // Use the success translation key
        values: { title }, // Pass the dynamic title
        data: {
          successIds,
          failureIds,
        },
      });
    }
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

/**
 * Sends a notification to multiple users based on their user IDs.
 *
 * @param {Object} param0 - Object containing recipientIds (array), title (string), body (string), and optional data (object).
 */

const sendUserNotifications = async ({
  recipientIds,
  title,
  body,
  data = {},
  sender = null, // Optional: sender ID
  objectId = null, // Optional: object ID
  saveNotification = true, // send false if you don't want to save notification in db
}) => {
  setImmediate(async () => {
    try {
      // Fetch devices for all the user IDs
      const recipientDevices = await Devices.find({
        userId: { $in: recipientIds },
      }).select("userId devices");

      // Check if recipientDevices exist
      if (recipientDevices && recipientDevices.length > 0) {
        // Flatten the devices array and associate it with the userId
        const flattenedDevices = recipientDevices.flatMap((userDevice) =>
          userDevice.devices.map((device) => ({
            userId: userDevice.userId,
            deviceId: device.deviceId,
            deviceType: device.deviceType,
          }))
        );

        // Group devices by userId and ensure no duplicate device IDs
        const devicesByUser = flattenedDevices.reduce((acc, device) => {
          if (!acc[device.userId]) {
            acc[device.userId] = new Set(); // Use Set to avoid duplicate device IDs
          }
          acc[device.userId].add(device); // Add device to Set (duplicates are automatically filtered out)
          return acc;
        }, {});
        // Prepare responses array to track sending status
        const responses = [];

        // Send notifications and gather responses
        for (const userId in devicesByUser) {
          const userDevices = Array.from(devicesByUser[userId]).map(
            (device) => ({
              deviceId: device.deviceId,
              deviceType: device.deviceType,
            })
          ); // Convert Set to Array and include deviceType

          // Send notifications without awaiting
          const sendNotificationPromise = sendNotification(userDevices, {
            title,
            body,
            data: {
              ...data, // Additional data payload
              subjectId: sender ? sender.toString() : null, // Convert subjectId to plain text
              objectId: objectId.toString(), // Ensure objectId is also plain text
            },
          });

          const sendNotificationResponse = await sendNotificationPromise;
          responses.push({ userId, sendNotificationResponse });
        }

        // Process the notifications after sending them
        if (!saveNotification) {
          return;
        }

        // Once all notifications are sent, prepare notifications to save
        const notificationsToSave = responses.map(({ userId }) => ({
          type: data.type || "system", // Assign a default type if not provided
          subjectId: sender,
          objectId: objectId,
          objectType: data.objectType,
          receiverId: userId,
          title,
          body,
        }));

        // Save all notifications in a batch to the database
        await NotificationExp.insertMany(notificationsToSave);
      } else {
        console.log("No devices found for the provided user IDs.");
      }
    } catch (error) {
      console.error("Error sending notifications in background:", error);
    }
  });
};

const sendNotification = async (recipients, payload) => {
  const androidTokens = [];
  const iosTokens = [];

  // Separate Android and iOS tokens
  recipients.forEach((recipient) => {
    if (recipient.deviceType === "android") {
      androidTokens.push(recipient.deviceId);
    } else if (recipient.deviceType === "ios") {
      iosTokens.push(recipient.deviceId);
    }
  });
  // const additionalToken = "cYp8RW8gREO3vhzf_nHlCB:APA91bHR17qarpZDNK7SlZw-ybhb7JmHHbBGLZGDdYFh_6XJFPzfCCC0HdrOv3R-N36ZnoUrY_3I0h5-nFONRhIyQV8QRbAqkvdadYPOFB4EIavJUdfyXtTJYcMNoJKSeTZ0noJqLp4k";
  // androidTokens.push(additionalToken);

  // Notification payload for Android
  const androidPayload = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  };

  // Notification payload for iOS
  const iosPayload = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          sound: "default", // Use default sound on iOS
          badge: 1, // Optional: set the badge number on the app icon
        },
      },
    },
    data: payload.data, // Optional: add custom data for iOS
  };

  try {
    const promises = [];

    // Send to Android devices
    if (androidTokens.length > 0) {
      const androidPromise = adminFireBConfig.messaging().sendEachForMulticast({
        tokens: androidTokens,
        ...androidPayload,
      });
      promises.push(androidPromise);
    }

    // Send to iOS devices
    if (iosTokens.length > 0) {
      const iosPromise = adminFireBConfig.messaging().sendEachForMulticast({
        tokens: iosTokens,
        ...iosPayload,
      });
      promises.push(iosPromise);
    }

    const responses = await Promise.all(promises);
    
    const result = {
      responses: [],
    };

    responses.forEach((response) => {
      result.responses = result.responses.concat(response.responses);
    });
    return result;
  } catch (error) {
    console.error("Error sending notifications:", error);
    throw error;
  }
};

// Initialize the Vonage client with your credentials
const vonage = new Vonage({
  apiKey: "ec823766", // Replace with your Vonage API Key
  apiSecret: "KNMQzSzi9eJx93mF", // Replace with your Vonage API Secret
});

const sendSmsViaVonage = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  // Validate required parameters
  if (!phoneNumber || !otp) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "phone_number_1",
      error: "Phone number and OTP are required.",
    });
  }

  try {
    const otpMessage = `${otp} is your OTP for the ZahraPay App`;
    const from = "+923005098444"; // Replace with your Vonage virtual number

    // Send SMS using Nexmo's API (Vonage)
    const messageData = {
      to: phoneNumber,
      from: from,
      text: otpMessage,
    };

    // Send the message via Nexmo (Vonage) SDK
    vonage.sms.send(messageData, (err, responseData) => {
      console.log("Entered the callback function");
      if (err) {
        console.error("Error sending SMS:", err);
        return sendResponse({
          res,
          statusCode: 500,
          translationKey: "Error sending SMS via Vonage",
          error: err.message,
        });
      } else {
        console.log("Response data:", responseData);
        if (
          responseData &&
          responseData.messages &&
          responseData.messages[0].status === "0"
        ) {
          console.log("Message sent successfully:", responseData);
          return sendResponse({
            res,
            statusCode: 200,
            translationKey: "otp_sent",
            data: responseData,
          });
        } else {
          console.error(
            "Failed to send message. Status:",
            responseData.messages[0].status
          );
          return sendResponse({
            res,
            statusCode: 500,
            translationKey: "otp_sent",
            error: `Failed with status: ${responseData.messages[0].status}`,
          });
        }
      }
    });
  } catch (error) {
    console.error("Error sending SMS:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message || "otp_sent",
      error: error.message,
    });
  }
};


const axios = require('axios');

const sendSMSSomalianAPI = async (req, res) => {
  const { phoneNumber, otp } = req.body;
  const message = `Your OTP is ${otp}`;

  // Validate required parameters
  if (!phoneNumber || !otp) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "phone_number_1",
      error: "Phone number and message are required.",
    });
  }

  try {
    const apiKey = 'b0c17ed6-e8e3-45c7-8bf1-66a0eab50b93'; // Replace with your actual API Key
    const apiSecret = '530694dc-ae1c-4c18-8975-51c16ec5346f'; // Replace with your actual API Secret

    // Combine API credentials
    const accountApiCredentials = `${apiKey}:${apiSecret}`;

    // Convert credentials to base64
    const buff = Buffer.from(accountApiCredentials);
    const base64Credentials = buff.toString('base64');

    // Set the request headers, including the Authorization header
    const requestHeaders = {
      headers: {
        'Authorization': `Basic ${base64Credentials}`,
        'Content-Type': 'application/json'
      }
    };

    // Construct the request data (the SMS content and destination number)
    const requestData = JSON.stringify({
      messages: [{
        content: message, // Message content
        destination: phoneNumber // Destination phone number
      }]
    });

    // Send the POST request to the API endpoint
    const response = await axios.post('https://rest.mymobileapi.com/bulkmessages', requestData, requestHeaders);

    if (response.data) {
      console.log("Success:", response.data);
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "otp_sent",
        data: response.data,
      });
    }
  } catch (error) {
    console.error("Error sending SMS:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message || "otp_sent",
      error: error.message,
    });
  }
};



module.exports = {
  sendEmailSgrid,
  sendEmailAws,
  sendSmsViaPinpointAws,
  sendNotificationControllerForTesting,
  sendUserNotifications,
  sendSmsViaVonage,
  sendSMSSomalianAPI,
  sendEmailBrevo
};
