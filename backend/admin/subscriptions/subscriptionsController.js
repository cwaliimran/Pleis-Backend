
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertTimezoneToUtcDateOnly,
  convertToUtcDateOnly,
} = require("../../helperUtils/responseUtil");
const SubscriptionService = require("./subscriptionsService");
// Allowed modules
const ALLOWED_MODULES = ["ordering", "loyalty", "reservations", "analytics"];

const createSubscription = async (req, res) => {
  try {
    const {
      modulePricing,
      bundleDiscounts,
      multiOrgPricing,
      yearlyDiscount,
      commissions
    } = req.body;

    // ---------------------------------------------------------
    // VALIDATION: modulePricing (required)
    // ---------------------------------------------------------
    if (!Array.isArray(modulePricing) || modulePricing.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "modulePricing_must_be_non_empty_array",
      });
    }

    const presentModules = modulePricing.map(m => m.module);

    for (const item of modulePricing) {
      if (!item.module || !ALLOWED_MODULES.includes(item.module)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey:
            "invalid_module_type_allowed_are_ordering_loyalty_reservations_analytics",
        });
      }

      if (
        item.price === undefined ||
        typeof item.price !== "number" ||
        item.price < 0
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "price_is_required_and_must_be_positive_number",
        });
      }
    }

// ---------------------------------------------------------
// VALIDATION: commissions (ONLY ticketingCommission allowed)
// ---------------------------------------------------------
let finalCommissions = { ticketingCommission: 0 };

if (commissions && typeof commissions === "object") {

  // ❌ orderingCommission is NOT allowed
  if (commissions.orderingCommission !== undefined) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "orderingCommission_not_allowed",
    });
  }

  // ❌ reservationCommission is NOT allowed
  if (commissions.reservationCommission !== undefined) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "reservationCommission_not_allowed",
    });
  }

  // ✔ Only ticketingCommission is allowed
  if (commissions.ticketingCommission !== undefined) {
    if (
      typeof commissions.ticketingCommission !== "number" ||
      commissions.ticketingCommission < 0
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "ticketingCommission_must_be_non_negative_number",
      });
    }

    finalCommissions.ticketingCommission =
      commissions.ticketingCommission;
  }
}

    // ---------------------------------------------------------
    // VALIDATION: bundleDiscounts (optional)
    // ---------------------------------------------------------
    let finalBundleDiscounts = { twoModules: 0, threeModules: 0 };

    if (bundleDiscounts && typeof bundleDiscounts === "object") {
      if (bundleDiscounts.twoModules !== undefined) {
        if (typeof bundleDiscounts.twoModules !== "number" || bundleDiscounts.twoModules < 0) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "twoModules_discount_must_be_positive_number",
          });
        }
        finalBundleDiscounts.twoModules = bundleDiscounts.twoModules;
      }

      if (bundleDiscounts.threeModules !== undefined) {
        if (typeof bundleDiscounts.threeModules !== "number" || bundleDiscounts.threeModules < 0) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "threeModules_discount_must_be_positive_number",
          });
        }
        finalBundleDiscounts.threeModules = bundleDiscounts.threeModules;
      }
    }

    // ---------------------------------------------------------
    // VALIDATION: multiOrgPricing (optional)
    // ---------------------------------------------------------
    let finalMultiOrgPricing = {};

    if (multiOrgPricing && typeof multiOrgPricing === "object") {
      const orgFields = [
        "oneOrg",
        "twoOrgs",
        "threeOrgs",
        "fourOrgs",
        "fiveOrgs",
        "sixPlusOrgs"
      ];

      for (const field of orgFields) {
        if (multiOrgPricing[field] !== undefined) {
          if (typeof multiOrgPricing[field] !== "number" || multiOrgPricing[field] < 0) {
            return sendResponse({
              res,
              statusCode: 400,
              translationKey: `${field}_must_be_non_negative_number`,
            });
          }
          finalMultiOrgPricing[field] = multiOrgPricing[field];
        }
      }
    }

    // ---------------------------------------------------------
    // VALIDATION: yearlyDiscount (optional)
    // ---------------------------------------------------------
    let finalYearlyDiscount = {};

    if (yearlyDiscount && typeof yearlyDiscount === "object") {
      if (
        yearlyDiscount.discountPercent !== undefined &&
        (typeof yearlyDiscount.discountPercent !== "number" || yearlyDiscount.discountPercent < 0)
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "discountPercent_must_be_non_negative_number",
        });
      }

      if (yearlyDiscount.discountPercent !== undefined) {
        finalYearlyDiscount.discountPercent = yearlyDiscount.discountPercent;
      }
    }

    // ---------------------------------------------------------
    // FINAL CLEAN DATA
    // ---------------------------------------------------------
    const data = {
      modulePricing,
      bundleDiscounts: finalBundleDiscounts,
      multiOrgPricing: finalMultiOrgPricing,
      yearlyDiscount: finalYearlyDiscount,
      commissions: finalCommissions
    };

    // ---------------------------------------------------------
    // SAVE SUBSCRIPTION SETTINGS
    // ---------------------------------------------------------
    const Subscription = await SubscriptionService.createSubscription(data);

    if (!Subscription) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "subscription_settings_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "subscription_settings_created_successfully",
      data: Subscription,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};




const getavailableSubscriptions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range, organizationsId, companyOrganizer } = req.query;
  try {
    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organizationsId || !Array.isArray(JSON.parse(organizationsId)) || JSON.parse(organizationsId).length === 0)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_or_organizationsId_is_required",
      });
    }

    const userId = companyOrganizer;
    const timezone = req.user.timezone;
    const { Subscriptions, meta } = await SubscriptionService.getavailableSubscriptions({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      organizationsId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscriptions_fetched_successfully",
      data: Subscriptions,
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

const getSubscriptionDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const Subscription = await SubscriptionService.getSubscriptionDetails(id);
    if (!Subscription) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Subscription_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscription_details_fetched_successfully",
      data: Subscription,
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

const updateSubscription = async (req, res) => {
  const { id } = req.params;

  // Validate ID format
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) {
    return;
  }

  try {
    const {
      modulePricing,
      bundleDiscounts,
      multiOrgPricing,
      yearlyDiscount,
      commissions   // <-- NEWLY ADDED
    } = req.body;

    // ---------------------------------------------------------
    // VALIDATION: modulePricing (conditional rules)
    // ---------------------------------------------------------
    let finalModulePricing;

    if (modulePricing !== undefined) {
      if (!Array.isArray(modulePricing) || modulePricing.length === 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "modulePricing_must_be_non_empty_array",
        });
      }

      for (const item of modulePricing) {

        if (item.price !== undefined && !item.module) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "module_required_when_updating_price",
          });
        }

        if (item.module && item.price === undefined) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "price_required_when_adding_or_updating_module",
          });
        }

        if (item.module && !ALLOWED_MODULES.includes(item.module)) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_module_type",
          });
        }

        if (item.price !== undefined) {
          if (typeof item.price !== "number" || item.price < 0) {
            return sendResponse({
              res,
              statusCode: 400,
              translationKey: "price_must_be_positive_number",
            });
          }
        }
      }

      finalModulePricing = modulePricing;
    }

    // ---------------------------------------------------------
    // VALIDATION: bundleDiscounts (optional)
    // ---------------------------------------------------------
    let finalBundleDiscounts;

    if (bundleDiscounts && typeof bundleDiscounts === "object") {
      finalBundleDiscounts = { twoModules: 0, threeModules: 0 };

      if (bundleDiscounts.twoModules !== undefined) {
        if (
          typeof bundleDiscounts.twoModules !== "number" ||
          bundleDiscounts.twoModules < 0
        ) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "twoModules_discount_must_be_positive_number",
          });
        }
        finalBundleDiscounts.twoModules = bundleDiscounts.twoModules;
      }

      if (bundleDiscounts.threeModules !== undefined) {
        if (
          typeof bundleDiscounts.threeModules !== "number" ||
          bundleDiscounts.threeModules < 0
        ) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "threeModules_discount_must_be_positive_number",
          });
        }
        finalBundleDiscounts.threeModules = bundleDiscounts.threeModules;
      }
    }

    // ---------------------------------------------------------
    // VALIDATION: multiOrgPricing (optional)
    // ---------------------------------------------------------
    let finalMultiOrgPricing;

    if (multiOrgPricing && typeof multiOrgPricing === "object") {
      finalMultiOrgPricing = {};

      const orgFields = [
        "oneOrg",
        "twoOrgs",
        "threeOrgs",
        "fourOrgs",
        "fiveOrgs",
        "sixPlusOrgs",
      ];

      for (const f of orgFields) {
        if (multiOrgPricing[f] !== undefined) {
          if (
            typeof multiOrgPricing[f] !== "number" ||
            multiOrgPricing[f] < 0
          ) {
            return sendResponse({
              res,
              statusCode: 400,
              translationKey: `${f}_must_be_non_negative_number`,
            });
          }
          finalMultiOrgPricing[f] = multiOrgPricing[f];
        }
      }
    }

    // ---------------------------------------------------------
    // VALIDATION: yearlyDiscount (optional)
    // ---------------------------------------------------------
    let finalYearlyDiscount;

    if (yearlyDiscount && typeof yearlyDiscount === "object") {
      finalYearlyDiscount = {};

      if (
        yearlyDiscount.discountPercent !== undefined &&
        (typeof yearlyDiscount.discountPercent !== "number" ||
          yearlyDiscount.discountPercent < 0)
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "discountPercent_must_be_non_negative_number",
        });
      }

      if (yearlyDiscount.discountPercent !== undefined) {
        finalYearlyDiscount.discountPercent =
          yearlyDiscount.discountPercent;
      }
    }

    // ---------------------------------------------------------
    // BUILD UPDATE PAYLOAD (Now includes commissions)
    // ---------------------------------------------------------
    const updatePayload = {};

    if (finalModulePricing) updatePayload.modulePricing = finalModulePricing;
    if (finalBundleDiscounts) updatePayload.bundleDiscounts = finalBundleDiscounts;
    if (finalMultiOrgPricing) updatePayload.multiOrgPricing = finalMultiOrgPricing;
    if (finalYearlyDiscount) updatePayload.yearlyDiscount = finalYearlyDiscount;

    // ⭐ NEW: Save commissions WITHOUT validation
    if (commissions !== undefined) {
      updatePayload.commissions = commissions;
    }

    if (Object.keys(updatePayload).length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_valid_fields_to_update",
      });
    }

    // ---------------------------------------------------------
    // DO UPDATE
    // ---------------------------------------------------------
    const updated = await SubscriptionService.updateSubscription(id, updatePayload);
if (updated.error){
      return sendResponse({
      res,
       statusCode: 400,
        translationKey:updated.error,
      });
    }
    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "subscription_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "subscription_updated_successfully",
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};





const deleteSubscription = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await SubscriptionService.deleteSubscription(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Subscription_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscription_deleted_successfully",
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









const getUserSubscriptions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range,billing,subscriptionTypes,selectedRange } = req.query;
  try {

    const timezone = req.user.timezone;
    const { subscriptions, meta } = await SubscriptionService.getUserSubscriptions({
      timezone,
      page,
      limit,
      keyword,
      status,
      date,
      range,
      billing,
      selectedRange,
      subscriptionTypes
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscriptions_fetched_successfully",
      data: subscriptions,
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





const updateUserSubscriptionStatus = async (req, res) => {
  const { id, value } = req.params;
  const validStatuses = ["confirmed", "rejected", "pending", "cancelled"];
  if (!validStatuses.includes(value)) {
    return res.status(404).json({
      message: "Invalid Subscription status value. Accepted values are: confirmed, rejected, pending, cancelled.",
    });
  }
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await SubscriptionService.updateUserSubscriptionStatus(id, value);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Subscription_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscription_updated_successfully",
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

const updateUserSubscription = async (req, res) => {
  const { id, userId } = req.params;
  const {
    firstName,
    lastName,
    partySize,
    phoneNumber,
    SubscriptionType,
    timingSlots,
    notes,
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const timezone = req.user.timezone;

  let data = {
    id,
    userId,
    firstName,
    lastName,
    partySize,
    phoneNumber,
    SubscriptionType,
    timingSlots,
    notes,

  };

  if (data.timingSlots) {
    const slots = data.timingSlots.dateTimeSlots || [];

    if (!Array.isArray(slots) || slots.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "timing_slots_required_when_enabled",
      });
    }

    for (const dateBlock of slots) {
      if (!dateBlock.date) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_date_in_timing_slots",
        });
      }

      if (!Array.isArray(dateBlock.timeSlots) || dateBlock.timeSlots.length === 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "time_slots_required_for_date",
        });
      }


      for (const slot of dateBlock.timeSlots) {

        if (!slot.startTime || !slot.endTime) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_start_or_end_time_in_slot",
          });
        }

        // Convert times to UTC
        slot.startTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.startTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );

        slot.endTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.endTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );


      }

    }
  }


  // Validate params
  if (
    !validateParams(req, res, {
      pathParams: ["id", "userId"],
      objectIdFields: ["id", "userId"],
    })
  ) {
    return; // Ensure you return if validation fails
  }
  const currentUser = req.user;
  // Only admin, manager, or organizer can update other users' profiles
  if (
    currentUser._id.toString() !== id &&
    !["admin", "manager", "organizer"].includes(currentUser.userType)
  ) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "unauthorized_to_perform_this_action",
    });
  }

  try {
    const update = await SubscriptionService.updateUserSubscription(data);
    if (!update) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Subscription_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscription_updated_successfully",
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


const getSubscriptions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "active", date, range } = req.query;
  try {

    const timezone = req.user.timezone;
    const { subscriptions, meta } = await SubscriptionService.getavailableSubscriptions({
      timezone,
      page,
      limit,
      keyword,
      status,
      date,
      range
    });

if (subscriptions.error){
      return sendResponse({
      res,
      statusCode: 400,
      translationKey: data.error,
    });
}
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscriptions_fetched_successfully",
      data: subscriptions,
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
const updateUserSubscriptions = async (req, res) => {
  const { id } = req.params;

  // Validate ID format
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) {
    return;
  }

  try {
    let { subscription } = req.body;


    // ---------------------------------------------------------
    // BUILD UPDATE PAYLOAD (Now includes all subscription fields)
    // ---------------------------------------------------------
    const updatePayload = { subscription: {} };

    // Handle subscription fields and add to updatePayload if they are provided
    if (subscription.subscriptionTypes !== undefined) {
      updatePayload.subscription.subscriptionTypes = subscription.subscriptionTypes;
    }

    if (subscription.pricingPlan !== undefined) {
      updatePayload.subscription.pricingPlan = subscription.pricingPlan;
    }

    if (subscription.numberOfOrganizations !== undefined) {
      updatePayload.subscription.numberOfOrganizations = subscription.numberOfOrganizations;
    }

    if (subscription.totalSubscriptionAmount !== undefined) {
      updatePayload.subscription.totalSubscriptionAmount = subscription.totalSubscriptionAmount;
    }

    if (subscription.startDate) {
      updatePayload.subscription.startDate = convertToUtcDateOnly(subscription.startDate, "UTC");
    }

    if (subscription.endDate) {
      updatePayload.subscription.endDate = convertToUtcDateOnly(subscription.endDate, "UTC");
    }

    if (subscription.status !== undefined) {
      updatePayload.subscription.status = subscription.status;
    }

    if (subscription.orderingCommission !== undefined) {
      updatePayload.subscription.orderingCommission = subscription.orderingCommission;
    }

    if (subscription.ticketingCommission !== undefined) {
      updatePayload.subscription.ticketingCommission = subscription.ticketingCommission;
    }

    if (subscription.reservationCommission !== undefined) {
      updatePayload.subscription.reservationCommission = subscription.reservationCommission;
    }

    // ---------------------------------------------------------
    // If no valid fields to update, return an error response
    // ---------------------------------------------------------
    if (Object.keys(updatePayload.subscription).length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_valid_fields_to_update",
      });
    }

    // ---------------------------------------------------------
    // Perform the update
    // ---------------------------------------------------------
    const UserSubscription = await SubscriptionService.updateUserSubscriptions(id, updatePayload);

    if (UserSubscription.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: UserSubscription.error,
      });
    }

    if (!UserSubscription) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "subscription_not_found",
      });
    }

    // Ensure the correct data structure is sent back
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "subscription_updated_successfully",
      data: UserSubscription,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};



module.exports = {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getSubscriptionDetails,
  getUserSubscriptions,
  updateUserSubscriptionStatus,
  updateUserSubscription,
  getavailableSubscriptions,
  updateUserSubscriptions
};