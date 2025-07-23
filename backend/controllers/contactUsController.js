// controllers/contactUsController.js
const ContactUs = require("../models/ContactUs");
const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  generateMeta,
} = require("../helperUtils/responseUtil");
const validator = require("validator");
const { sendEmailViaBrevo } = require("../helperUtils/emailUtil");
const { config } = require("dotenv");

// Create a new contact request
const createContactRequest = async (req, res) => {
  const { name, email, phoneNumber, description } = req.body;

  const validationOptions = {
    rawData: ["name", "email", "description"],
  };

  if (!validateParams(req, res, validationOptions)) {
    return;
  }

  // Validate phone number format
  if (
    phoneNumber &&
    !validator.isMobilePhone(phoneNumber, "any", { strictMode: true })
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_phone",
    });
  }

  try {
    const contactRequest = new ContactUs({
      name,
      email,
      phoneNumber,
      description,
      status: "pending", // Set the default status
    });

    // Send email within the transaction
    const subject = "Contact Us Request by " + name;
    //append phone number with description if available
    const mDescription = phoneNumber
      ? `${description} \n Name: ${name} \n Email: ${email} \n Phone Number: ${phoneNumber}`
      : `${description} \n Name: ${name} \n Email: ${email}`;

    const supportEmail = process.env.SUPPORT_EMAIL;

    await Promise.all([
      contactRequest.save(),
      //  sendEmailViaBrevo([supportEmail], subject, mDescription, {
      // isHtml: false,
      // }),
    ]);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "contact_request",
    });
  } catch (error) {

    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      // Use the first error message key for translation
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: errorMessages[0], // Directly use the error key in the translationKey
        error: error,
      });
    }

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};


module.exports = {
  createContactRequest,
};
