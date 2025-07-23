const { sendResponse, parsePaginationParams, generateMeta } = require("../../../helperUtils/responseUtil");
const AdminSettings = require("../models/AdminSettings");
const Faq = require("../models/Faq");

// Get Terms and Conditions
const getTermsAndConditions = async (req, res) => {
  try {
    const settings = await AdminSettings.findOne({}, "terms_and_conditions");
    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "terms_and",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "terms_and_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get About Us
const getAboutUs = async (req, res) => {
  try {
    const settings = await AdminSettings.findOne({}, "about_us");
    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "about_us",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "about_us_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get Privacy Policy
const getPrivacyPolicy = async (req, res) => {
  try {
    const settings = await AdminSettings.findOne({}, "privacy_policy");
    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "privacy_policy",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "privacy_policy_1",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Get Privacy Policy
const getFaqs = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword } = req.query; // Get keyword from query

    // Initialize query object with base condition
    let queryConditions = {};
    // Apply keyword search on both `name` and `anonymousName` if keyword is provided
    if (keyword && keyword.trim() !== "") {
      queryConditions.$or = [
        { question: { $regex: keyword, $options: "i" } },
        { answer: { $regex: keyword, $options: "i" } },
      ];
    }

    const [faqs, totalRecords] = await Promise.all([
      Faq.find(queryConditions)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
      Faq.countDocuments(queryConditions),
    ]);

    let meta = generateMeta(page, limit, totalRecords);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Faqs fetched successfully",
      data: faqs,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "something_went_wrong",
      error,
    });
  }
};

// Create Admin Settings
const createAdminSettings = async (req, res) => {
  const { terms_and_conditions, about_us, privacy_policy } = req.body;

  try {
    // Check if AdminSettings already exist
    const existingSettings = await AdminSettings.findOne();
    if (existingSettings) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "admin_settings",
      });
    }

    // Create new admin settings
    const newSettings = new AdminSettings({
      terms_and_conditions: terms_and_conditions || "",
      about_us: about_us || "",
      privacy_policy: privacy_policy || "",
    });

    const savedSettings = await newSettings.save();
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "admin_settings_1",
      data: savedSettings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

// Update Admin Settings (Optional: To update multiple fields at once)
const updateAdminSettings = async (req, res) => {
  const { id } = req.params;
  const updateData = {};

  if (req.body.terms_and_conditions)
    updateData.terms_and_conditions = req.body.terms_and_conditions;
  if (req.body.about_us) updateData.about_us = req.body.about_us;
  if (req.body.privacy_policy)
    updateData.privacy_policy = req.body.privacy_policy;

  try {
    const settings = await AdminSettings.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!settings) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "admin_settings_2",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "admin_settings_3",
      data: settings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getTermsAndConditions,
  getAboutUs,
  getPrivacyPolicy,
  updateAdminSettings,
  createAdminSettings,
  getFaqs,
};
