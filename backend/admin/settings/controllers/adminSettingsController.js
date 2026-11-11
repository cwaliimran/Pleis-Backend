const { sendResponse, parsePaginationParams, generateMeta } = require("@utils/responseUtil");
const { User } = require("../../../models/UserModel");
const AdminSettings = require("../models/AdminSettings");
const Faq = require("../models/Faq");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";
const buildAdminSettingsCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const invalidateAdminSettingsScope = async (scope) => {
  await invalidate(`${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}`);
};

// Get Terms and Conditions
const getTermsAndConditions = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: "terms_conditions",
      skip: 0,
      limit: 10,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne(
          {},
          "terms_and_conditions"
        );
      },
    });

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
    const cacheKey = buildAdminSettingsCacheKey({
      scope: "about_us",
      skip: 0,
      limit: 10,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "about_us");
      },
    });

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
    const cacheKey = buildAdminSettingsCacheKey({
      scope: "privacy_policy",
      skip: 0,
      limit: 10,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne({}, "privacy_policy");
      },
    });

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
    const { keyword } = req.query;

    const skip = (page - 1) * limit;

    const cacheKey = buildAdminSettingsCacheKey({
      scope: "faqs",
      skip,
      limit,
    });

    const result = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        let queryConditions = {};

        if (keyword && keyword.trim() !== "") {
          queryConditions.$or = [
            { question: { $regex: keyword, $options: "i" } },
            { answer: { $regex: keyword, $options: "i" } },
          ];
        }

        const [faqs, totalRecords] = await Promise.all([
          Faq.find(queryConditions)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
          Faq.countDocuments(queryConditions),
        ]);

        return {
          faqs,
          totalRecords,
        };
      },
    });

    const meta = generateMeta(page, limit, result.totalRecords);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "faqs_fetched_successfully",
      data: result.faqs,
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
  try {
    // invalidate only relevant sections
    await Promise.all([
      invalidateAdminSettingsScope("terms_conditions"),
      invalidateAdminSettingsScope("about_us"),
      invalidateAdminSettingsScope("privacy_policy"),
    ]);

    const { terms_and_conditions, about_us, privacy_policy } = req.body;

    const existingSettings = await AdminSettings.findOne();
    if (existingSettings) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "admin_settings",
      });
    }

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

  const invalidations = [];

  if (req.body.terms_and_conditions) {
    updateData.terms_and_conditions = req.body.terms_and_conditions;
    invalidations.push("terms_conditions");
  }

  if (req.body.customer_terms_and_conditions) {
    updateData.customer_terms_and_conditions =
      req.body.customer_terms_and_conditions;
    invalidations.push("customer_terms_conditions");
  }

  if (req.body.about_us) {
    updateData.about_us = req.body.about_us;
    invalidations.push("about_us");
  }

  if (req.body.privacy_policy) {
    updateData.privacy_policy = req.body.privacy_policy;
    invalidations.push("privacy_policy");
  }

  if (req.body.sales_terms) {
    updateData.sales_terms = req.body.sales_terms;
    invalidations.push("sales_terms");
  }

  // invalidate only touched scopes
  await Promise.all(
    [...new Set(invalidations)].map(scope =>
      invalidateAdminSettingsScope(scope)
    )
  );

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

    // Any change to a legal text must exist as an immutable version (consent log
    // points at it). Publish one for each legal field whose text actually changed.
    const legalService = require("../../../commonModules/legal/legalService");
    const legalFields = {
      terms_and_conditions: "partner_terms",
      customer_terms_and_conditions: "terms_of_use",
      privacy_policy: "privacy_policy",
      sales_terms: "sales_terms",
    };
    for (const [field, type] of Object.entries(legalFields)) {
      if (!req.body[field]) continue;
      const latest = await legalService.getLatestDocument(type);
      if (latest?.content !== req.body[field]) {
        await legalService.publishDocument({
          type,
          content: req.body[field],
          summary: req.body.summary || "",
          publishedBy: req.user?._id,
        });
      }
    }

    if (req.body.terms_and_conditions) {
      await User.updateMany(
        { "accountState.userType": "organizer" },
        { $set: { termsAccepted: req.body.termsAccepted || false } }
      );
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

const getCustomerTermsAndConditions = async (req, res) => {
  try {
    const cacheKey = buildAdminSettingsCacheKey({
      scope: "customer_terms_conditions",
      skip: 0,
      limit: 10,
    });

    const settings = await cache({
      namespace: cacheKey,
      ttl: 86400, // 1 day

      fetchFn: async () => {
        return AdminSettings.findOne(
          {},
          "customer_terms_and_conditions"
        );
      },
    });

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


// ── Compliance settings (P5): read by the guest app at checkout, so behaviour changes
//    by changing the setting, with no new delivery. Cached briefly, busted on update.
const COMPLIANCE_CACHE_KEY = `${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:compliance`;
const AGE_NOTICE_MODES = ["notice", "confirmation"];
const DEFAULT_ORDERING_TITLE = "In place Offer";

const getComplianceSettings = async (req, res) => {
  try {
    const data = await cache({
      namespace: COMPLIANCE_CACHE_KEY,
      ttl: 300,
      fetchFn: async () => {
        const s = await AdminSettings.findOne({}, "age_notice_mode ordering_screen_title").lean();
        return {
          ageNoticeMode: AGE_NOTICE_MODES.includes(s?.age_notice_mode) ? s.age_notice_mode : "notice",
          orderingScreenTitle: (s?.ordering_screen_title || "").trim() || DEFAULT_ORDERING_TITLE,
        };
      },
    });
    return sendResponse({ res, statusCode: 200, translationKey: "compliance_settings_fetched", data });
  } catch (error) {
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  }
};

const updateComplianceSettings = async (req, res) => {
  const { ageNoticeMode, orderingScreenTitle } = req.body || {};
  const $set = {};
  if (ageNoticeMode !== undefined) {
    if (!AGE_NOTICE_MODES.includes(ageNoticeMode)) {
      return sendResponse({ res, statusCode: 400, translationKey: "invalid_age_notice_mode" });
    }
    $set.age_notice_mode = ageNoticeMode;
  }
  if (orderingScreenTitle !== undefined) {
    const title = String(orderingScreenTitle).trim();
    if (!title || title.length > 40) {
      return sendResponse({ res, statusCode: 400, translationKey: "ordering_screen_title_must_be_1_to_40_characters" });
    }
    $set.ordering_screen_title = title;
  }
  if (!Object.keys($set).length) {
    return sendResponse({ res, statusCode: 400, translationKey: "nothing_to_update" });
  }
  try {
    await AdminSettings.updateOne({}, { $set }, { upsert: true });
    await invalidate(COMPLIANCE_CACHE_KEY);
    return sendResponse({ res, statusCode: 200, translationKey: "compliance_settings_updated", data: req.body });
  } catch (error) {
    return sendResponse({ res, statusCode: 500, translationKey: error.message, error });
  }
};

module.exports = {
  getComplianceSettings,
  updateComplianceSettings,
  getTermsAndConditions,
  getAboutUs,
  getPrivacyPolicy,
  updateAdminSettings,
  createAdminSettings,
  getFaqs,
  getCustomerTermsAndConditions
};
