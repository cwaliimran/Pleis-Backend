
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { countOrganizations, countActiveOrganizationsByCreator } = require("../organizations/organizationRepository");
const SubscriptionService = require("./subscriptionsService");
// Allowed modules
const ALLOWED_MODULES = ["ordering", "loyalty", "reservations", "analytics"];
const getMultiOrgPrice = (numberOfOrganizations, multiOrgPricing) => {
  if (numberOfOrganizations === 1) {
    return multiOrgPricing.oneOrg;
  } else if (numberOfOrganizations === 2) {
    return multiOrgPricing.twoOrgs;
  } else if (numberOfOrganizations === 3) {
    return multiOrgPricing.threeOrgs;
  } else if (numberOfOrganizations === 4) {
    return multiOrgPricing.fourOrgs;
  } else if (numberOfOrganizations === 5) {
    return multiOrgPricing.fiveOrgs;
  } else if (numberOfOrganizations >= 6) {
    return multiOrgPricing.sixPlusOrgs;
  }
  return 0; // Default value if none of the conditions match
};
const calculateModulePrice = (modulesToInclude, subscriptionSettings) => {
  let basePrice = 0;
  modulesToInclude.forEach(module => {
    const moduleSetting = subscriptionSettings.modulePricing.find(item => item.module === module);
    if (moduleSetting) {
      basePrice += moduleSetting.price;
    }
  });
  return basePrice;
};

/**
 * Full plan price using admin settings:
 * modules → bundle discount → analytics → multi-org % → * orgs → yearly discount
 * Returns { basePrice (after bundle, before multi-org), finalPrice }
 */
const calculateFullPlanPrice = (
  subscriptionTypes,
  pricingPlan,
  numberOfOrganizations,
  subscriptionSettings
) => {
  const selectedModules = subscriptionTypes || [];
  const modulesToInclude = selectedModules.filter(
    (module) => module !== "analytics" && module !== "free"
  );

  let basePrice = calculateModulePrice(modulesToInclude, subscriptionSettings);

  let bundleDiscount = 0;
  if (modulesToInclude.length === 2) {
    bundleDiscount = subscriptionSettings.bundleDiscounts.twoModules;
  } else if (modulesToInclude.length === 3) {
    bundleDiscount = subscriptionSettings.bundleDiscounts.threeModules;
  }

  let priceAfterBundleDiscount =
    basePrice - basePrice * (bundleDiscount / 100);

  if (selectedModules.includes("analytics")) {
    const analyticsModule = subscriptionSettings.modulePricing.find(
      (item) => item.module === "analytics"
    );
    if (analyticsModule) {
      priceAfterBundleDiscount += analyticsModule.price;
    }
  }

  const multiOrgPrice = getMultiOrgPrice(
    numberOfOrganizations,
    subscriptionSettings.multiOrgPricing
  );
  let finalBasePrice =
    priceAfterBundleDiscount * (multiOrgPrice / 100) * numberOfOrganizations;

  let finalPrice = finalBasePrice;
  if (pricingPlan === "yearly") {
    finalPrice = finalBasePrice * 12;
    finalPrice -=
      finalPrice *
      (subscriptionSettings.yearlyDiscount.discountPercent / 100);
  }

  return {
    basePrice: priceAfterBundleDiscount,
    finalPrice: Number(Number(finalPrice).toFixed(2)),
  };
};
const compareModules = (includedModules, selectedModules) => {
  // Find the modules that are in selectedModules but not in includedModules (added modules)
  const addedModules = selectedModules.filter(module => !includedModules.includes(module));
  // Find the modules that are in includedModules but not in selectedModules (removed modules)
  const removedModules = includedModules.filter(module => !selectedModules.includes(module));
  return {
    addedModules,    // Modules added
    removedModules,  // Modules removed
  };
};
const getDaysInCurrentMonth = (dateInput = null) => {
  const date = dateInput ? new Date(dateInput) : new Date();

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  // last day of month (UTC safe)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return daysInMonth;
};
const calculateRemainingDays = (startDate, endDate) => {
  const toUTCDate = (date) => {
    const d = new Date(date);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };

  const todayUTC = toUTCDate(new Date());
  const endUTC = toUTCDate(endDate);

  if (todayUTC >= endUTC) {
    return 0;
  }

  const diff = endUTC - todayUTC;

  return diff / (1000 * 60 * 60 * 24);
};
const calculateDaysSpent = (startDate) => {
  const currentDate = new Date();
  const start = new Date(startDate);
  const timeDifference = currentDate - start;
  const daysSpent = timeDifference / (1000 * 3600 * 24);
  return Math.floor(daysSpent);
};
const getDaysInCurrentYear = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const isLeapYear = (year) => {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  };
  return isLeapYear(currentYear) ? 366 : 365;
};
const checkIsTheUpdateAllowed = async (userSubscription, body) => {
  const currentSubscription = userSubscription.activeSubscription;
  let finalDirection = 'None';

  // Check if there is any difference in subscription types
  const addedSubscriptionTypes = body.subscriptionTypes.filter(type => !currentSubscription.subscriptionTypes.includes(type));
  const removedSubscriptionTypes = currentSubscription.subscriptionTypes.filter(type => !body.subscriptionTypes.includes(type));

  let subscriptionTypeChangeDirection = null; // 1 for increase, -1 for decrease

  // Determine if subscription types are increased or decreased
  if (addedSubscriptionTypes.length > 0 && removedSubscriptionTypes.length === 0) {
    // Subscription types are increased
    subscriptionTypeChangeDirection = 1;
  } else if (removedSubscriptionTypes.length > 0 && addedSubscriptionTypes.length === 0) {
    // Subscription types are decreased
    subscriptionTypeChangeDirection = -1;

  } else if (
    addedSubscriptionTypes.length > 0 &&
    removedSubscriptionTypes.length > 0
  ) {

    const isFreeSwitch =
      addedSubscriptionTypes.length === 1 &&
      addedSubscriptionTypes.includes("free");

    if (!isFreeSwitch) {
      return {
        error: 'Invalid operation. Cannot mix increase and decrease subscription types.'
      };
    }
    subscriptionTypeChangeDirection = -1;
  }

  let pricingPlanChangeDirection = null;
  if (body.pricingPlan !== currentSubscription.pricingPlan) {

    pricingPlanChangeDirection = -1;
    finalDirection = 'Decrease';
    return { finalDirection };
  }
  const organizationChangeDirection =
    body.numberOfOrganizations > currentSubscription.numberOfOrganizations ? 1 :
      body.numberOfOrganizations < currentSubscription.numberOfOrganizations ? -1 : null;

  const directions = [
    subscriptionTypeChangeDirection,
    organizationChangeDirection,
    pricingPlanChangeDirection,
  ].filter(d => d !== null);

  const hasIncrease = directions.includes(1);
  const hasDecrease = directions.includes(-1);

  if (hasIncrease && hasDecrease) {
    return {
      error: 'Cannot mix increase and decrease operations for subscription types, pricing plan, and number of organizations.',
    };
  }
  if (hasIncrease) {
    finalDirection = 'Increase';
  } else if (hasDecrease) {
    finalDirection = 'Decrease';
  }
  return { finalDirection };
}
const calculateSubscriptionPrice = async (userId, body) => {
  const [subscriptionSettings, userSubscription] = await Promise.all([
    SubscriptionService.getSubscriptionSettings(),
    SubscriptionService.getUserSubscription(userId)
  ]);

  const isFirstTimeOrFree =
    userSubscription.activeSubscription.subscriptionTypes.includes("free") ||
    userSubscription.activeSubscription.status == "inactive" ||
    userSubscription.activeSubscription.endDate == null;

  if (isFirstTimeOrFree) {
    const { basePrice, finalPrice } = calculateFullPlanPrice(
      body.subscriptionTypes,
      body.pricingPlan,
      body.numberOfOrganizations,
      subscriptionSettings
    );

    if (
      Number(body.totalSubscriptionAmount).toFixed(2) !==
      Number(finalPrice).toFixed(2)
    ) {
      return {
        error: `calculated_price_mismatch expected amount is ${finalPrice}`,
      };
    }

    return { basePrice, direction: "new" };
  }

  const updatedSubscription = await checkIsTheUpdateAllowed(
    userSubscription,
    body
  );
  if (updatedSubscription.error) {
    return { error: updatedSubscription.error };
  }

  let moduleComparison = { addedModules: [], removedModules: [] };
  const amountPaid = Number(
    userSubscription.activeSubscription.totalSubscriptionAmount || 0
  );
  if (body.subscriptionTypes) {
    moduleComparison = compareModules(
      userSubscription.activeSubscription.subscriptionTypes,
      body.subscriptionTypes
    );
  }

  if (updatedSubscription.finalDirection === "Increase") {
    if (
      moduleComparison.addedModules?.length > 0 ||
      body.numberOfOrganizations >
        userSubscription.activeSubscription.numberOfOrganizations
    ) {
      if (body.subscriptionTypes.includes("free")) {
        return {
          basePrice: 0,
          direction: updatedSubscription.finalDirection,
        };
      }

      const { basePrice, finalPrice } = calculateFullPlanPrice(
        body.subscriptionTypes,
        body.pricingPlan,
        body.numberOfOrganizations,
        subscriptionSettings
      );

      const remainingDays = calculateRemainingDays(
        userSubscription.activeSubscription.startDate,
        userSubscription.activeSubscription.endDate
      );
      const totalDays =
        userSubscription.activeSubscription.pricingPlan === "yearly"
          ? getDaysInCurrentYear()
          : getDaysInCurrentMonth(
              userSubscription.activeSubscription.startDate
            );

      const remainingAmount = Math.max(finalPrice - amountPaid, 0);
      const pricePerDay = totalDays > 0 ? remainingAmount / totalDays : 0;
      const priceForRemainingDays = Number(
        (pricePerDay * remainingDays).toFixed(2)
      );

      if (
        Number(body.totalSubscriptionAmount).toFixed(2) !==
          Number(finalPrice).toFixed(2) ||
        Number(body.priceForRemainingDays).toFixed(2) !==
          Number(priceForRemainingDays).toFixed(2)
      ) {
        return {
          error: `calculated_price_mismatch_expected_amount_is_${Number(
            finalPrice
          ).toFixed(2)}_and_remaining_days_price_is_${Number(
            priceForRemainingDays
          ).toFixed(2)}`,
        };
      }

      return {
        basePrice,
        direction: updatedSubscription.finalDirection,
        priceForRemainingDays,
      };
    }
  }

  if (updatedSubscription.finalDirection === "Decrease") {
    if (
      moduleComparison.removedModules.length > 0 ||
      body.numberOfOrganizations <
        userSubscription.activeSubscription.numberOfOrganizations ||
      body.pricingPlan !== userSubscription.activeSubscription.pricingPlan
    ) {
      const { basePrice, finalPrice } = calculateFullPlanPrice(
        body.subscriptionTypes,
        body.pricingPlan,
        body.numberOfOrganizations,
        subscriptionSettings
      );

      if (
        Number(body.totalSubscriptionAmount).toFixed(2) !==
        Number(finalPrice).toFixed(2)
      ) {
        return {
          error: `calculated_price_mismatch expected amount is ${finalPrice}`,
        };
      }

      return {
        basePrice,
        direction: updatedSubscription.finalDirection,
      };
    }
  }

  return 0;
};
const updateSubscription = async (req, res) => {
  try {
    const {

      subscriptionTypes,
      pricingPlan,
      numberOfOrganizations,
      totalSubscriptionAmount,
      status = "active"
    } = req.body;

    const totalOrganizations = await countActiveOrganizationsByCreator(req.user._id);
    if (numberOfOrganizations !== undefined && numberOfOrganizations < totalOrganizations) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: `number_Of_Organizations_cannot_be_less_than_current_active_organizations_count_${totalOrganizations}`,
      });
    }
    const result = await calculateSubscriptionPrice(req.user._id, req.body);
    if (result.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error,
      });
    }
    /* ================= CONSTANTS ================= */
    const basePrice = result.basePrice;

    const direction = result.direction;
    const ALLOWED_SUBSCRIPTION_TYPES = [
      "free",
      "ordering",
      "reservations",
      "analytics",
      "loyalty"
    ];

    const ALLOWED_PRICING_PLANS = ["monthly", "yearly"];

    /* ================= VALIDATION ================= */

    const updatePayload = {};
    updatePayload.basePrice = basePrice;
    updatePayload.direction = direction;
    updatePayload.userId = req.user._id;
    updatePayload.status = status;


    // ---- subscriptionTypes ----
    if (subscriptionTypes !== undefined) {
      if (
        !Array.isArray(subscriptionTypes) ||
        subscriptionTypes.length === 0
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "subscriptionTypes_must_be_non_empty_array",
        });
      }
      for (const type of subscriptionTypes) {
        if (!ALLOWED_SUBSCRIPTION_TYPES.includes(type)) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_subscription_type",
          });
        }
      }

      if (new Set(subscriptionTypes).size !== subscriptionTypes.length) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "duplicate_subscription_type_not_allowed",
        });
      }

      updatePayload.subscriptionTypes = subscriptionTypes;
    }
    if (pricingPlan !== undefined) {
      if (!ALLOWED_PRICING_PLANS.includes(pricingPlan)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_pricing_plan",
        });
      }

      updatePayload.pricingPlan = pricingPlan;
    }

    // ---- numberOfOrganizations ----
    if (numberOfOrganizations !== undefined) {
      if (
        typeof numberOfOrganizations !== "number" ||
        numberOfOrganizations < 1
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "number_Of_Organizations_must_be_positive_integer",
        });
      }

      updatePayload.numberOfOrganizations = numberOfOrganizations;
    }

    // ---- totalSubscriptionAmount ----
    if (totalSubscriptionAmount !== undefined) {
      if (
        typeof totalSubscriptionAmount !== "number" ||
        totalSubscriptionAmount < 0
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "totalSubscriptionAmount_must_be_non_negative_number",
        });
      }

      updatePayload.totalSubscriptionAmount = totalSubscriptionAmount;
    }

    /* ================= EMPTY CHECK ================= */

    if (Object.keys(updatePayload).length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "no_valid_fields_to_update",
      });
    }
    /* ================= UPDATE ================= */

    const updated = await SubscriptionService.updateSubscription(updatePayload);
    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "subscription_not_found",
      });
    }

    if (updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }
    if (updated.updated === "inactive") {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "subscription_updated_successfully_it_will_reflect_after_current_subscription_end",
        data: updated,
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

    if (subscriptions.error) {
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


const getUserSubscriptions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range } = req.query;
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
      userId: req.user._id
    });

    if (subscriptions.error) {
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
const resetSubscriptions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { userId } = req.query;
  try {
    if (!userId) {
      userId = req.user._id;
    }
    const subscriptions = await SubscriptionService.resetSubscriptions({
      userId
    });

    if (subscriptions.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: subscriptions.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Subscriptions_reset_successfully",
      data: subscriptions,
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

const PAYMENT_STATUSES = [
  "not_required",
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
];

const validatePaymentItem = (item, res) => {
  if (!item.subscriptionType) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "subscriptionType_is_required",
    });
    return false;
  }

  if (!ALLOWED_MODULES.includes(item.subscriptionType)) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_subscriptionType",
    });
    return false;
  }

  if (!item.status) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "payment_status_is_required",
    });
    return false;
  }

  if (!PAYMENT_STATUSES.includes(item.status)) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_payment_status",
    });
    return false;
  }

  if (
    item.amount !== undefined &&
    (typeof item.amount !== "number" || item.amount < 0)
  ) {
    sendResponse({
      res,
      statusCode: 400,
      translationKey: "amount_must_be_non_negative_number",
    });
    return false;
  }

  return true;
};

const updateUserSubscriptionPaymentStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    const { paymentReference, providerTransactionId, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "subscription_payment_items_required",
      });
    }

    const paymentItems = items;

    const itemTypes = paymentItems.map((item) => item.subscriptionType);
    if (new Set(itemTypes).size !== itemTypes.length) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "duplicate_subscription_type_in_payment_items",
      });
    }

    for (const item of paymentItems) {
      if (!validatePaymentItem(item, res)) {
        return;
      }
    }

    const updated =
      await SubscriptionService.updateUserSubscriptionPaymentStatus(userId, {
        items: paymentItems,
        paymentReference,
        providerTransactionId,
      });

    if (updated?.error) {
      return sendResponse({
        res,
        statusCode: updated.statusCode || 400,
        translationKey: updated.error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey:
        "subscription_payment_status_updated_successfully",
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

module.exports = {
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions,
  resetSubscriptions,
  updateUserSubscriptionPaymentStatus,

};