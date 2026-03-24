
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
const getDaysInCurrentMonth = () => {
  const currentDate = new Date();
  const firstDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  const lastDayOfMonth = new Date(firstDayOfNextMonth - 1);
  const totalDaysInMonth = lastDayOfMonth.getDate();
  return totalDaysInMonth;
};
const calculateRemainingDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentDate = new Date();


  if (currentDate >= end) {
    return 0;
  }
  const timeDifference = end - currentDate;
  const remainingDays = timeDifference / (1000 * 3600 * 24);
  return Math.floor(remainingDays);
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
  } else if (addedSubscriptionTypes.length > 0 && removedSubscriptionTypes.length > 0) {
    return { error: 'Invalid operation. Cannot mix increase and decrease subscription types.' };
  }

  let pricingPlanChangeDirection = null;
  if (body.pricingPlan !== currentSubscription.pricingPlan) {
    pricingPlanChangeDirection = -1;
  }
  const organizationChangeDirection =
    body.numberOfOrganizations > currentSubscription.numberOfOrganizations ? 1 :
      body.numberOfOrganizations < currentSubscription.numberOfOrganizations ? -1 : null;
  if (
    (subscriptionTypeChangeDirection === 1 && organizationChangeDirection === -1) ||
    (subscriptionTypeChangeDirection === -1 && organizationChangeDirection === 1) ||
    (subscriptionTypeChangeDirection === 1 && pricingPlanChangeDirection === -1) ||
    (subscriptionTypeChangeDirection === -1 && pricingPlanChangeDirection === 1)
  ) {
    return { error: 'Cannot mix increase and decrease operations for subscription types, pricing plan, and number of organizations.' };
  }
  let finalDirection = 'None';

  if (subscriptionTypeChangeDirection === 1 || organizationChangeDirection === 1 || pricingPlanChangeDirection === 1) {
    finalDirection = 'Increase';
  } else if (subscriptionTypeChangeDirection === -1 || organizationChangeDirection === -1 || pricingPlanChangeDirection === -1) {
    finalDirection = 'Decrease';
  }
  return { finalDirection };
}
const calculateSubscriptionPrice = async (userId, body) => {
  const [subscriptionSettings, userSubscription] = await Promise.all([
    SubscriptionService.getSubscriptionSettings(),
    SubscriptionService.getUserSubscription(userId)
  ]);

  if (userSubscription.activeSubscription.subscriptionTypes.includes('free')) {
    let basePrice = 0;
    let selectedModules = body.subscriptionTypes;

    // Step 1: Calculate base price from selected modules (excluding 'analytics')
    const modulesToInclude = selectedModules.filter(module => module !== 'analytics');
    basePrice += calculateModulePrice(modulesToInclude, subscriptionSettings);


    // Step 2: Apply bundle discount for eligible modules
    const eligibleForDiscount = modulesToInclude;
    let bundleDiscount = 0;
    if (eligibleForDiscount.length === 2) {
      bundleDiscount = subscriptionSettings.bundleDiscounts.twoModules;
    } else if (eligibleForDiscount.length === 3) {
      bundleDiscount = subscriptionSettings.bundleDiscounts.threeModules;
    }

    // Step 3: Apply bundle discount
    let priceAfterBundleDiscount = basePrice - (basePrice * (bundleDiscount / 100));

    // Step 4: Add 'analytics' module price if included
    if (selectedModules.includes('analytics')) {
      const analyticsModule = subscriptionSettings.modulePricing.find(item => item.module === 'analytics');
      if (analyticsModule) {
        priceAfterBundleDiscount += analyticsModule.price;
      }
    }

    // Step 5: Apply multi-organization pricing based on number of organizations
    const multiOrgPricing = subscriptionSettings.multiOrgPricing;
    let multiOrgPrice = getMultiOrgPrice(body.numberOfOrganizations, multiOrgPricing);


    // Step 6: Apply multi-org pricing to the final base price
    let finalBasePrice = priceAfterBundleDiscount * (multiOrgPrice / 100);
    finalBasePrice *= body.numberOfOrganizations; // Adjust price based on the number of organizations

    // Step 7: Apply yearly discount if applicable
    let finalPrice = finalBasePrice;
    if (body.pricingPlan === 'yearly') {
      finalPrice = finalBasePrice * 12; // Monthly price multiplied by 12 for yearly
      finalPrice -= (finalPrice * (subscriptionSettings.yearlyDiscount.discountPercent / 100));
    }

    // Step 8: Check if the calculated price matches the provided total subscription amount
    if (body.totalSubscriptionAmount !== finalPrice) {
      return { error: `calculated_price_mismatch expected amount is ${finalPrice}` };
    }
    // Step 9: Return the final calculated price
    return { basePrice: finalPrice, direction: "new" };
  }
  else {
    const updatedSubscription = await checkIsTheUpdateAllowed(userSubscription, body);
    if (updatedSubscription.error) {
      return { error: updatedSubscription.error };
    }

    let moduleComparison = []
    const amountPaid = userSubscription.activeSubscription.totalSubscriptionAmount;
    if (body.subscriptionTypes) {
      moduleComparison = compareModules(userSubscription.activeSubscription.subscriptionTypes, body.subscriptionTypes);
    }
    if (moduleComparison.addedModules?.length > 0 || body.numberOfOrganizations > userSubscription.activeSubscription.numberOfOrganizations) {
      let basePrice = userSubscription.activeSubscription.basePrice;
      let finalPrice = basePrice;
      let priceForRemainingDays = 0;
      const dayesSpent = calculateDaysSpent(userSubscription.activeSubscription.startDate);
      const remainingDayes = calculateRemainingDays(userSubscription.activeSubscription.startDate, userSubscription.activeSubscription.endDate);
      if (body.subscriptionTypes) {

        if (moduleComparison.addedModules.length > 0) {
          basePrice += calculateModulePrice(moduleComparison.addedModules, subscriptionSettings);
          finalPrice += basePrice
        }
      }
      if (body.numberOfOrganizations > userSubscription.activeSubscription.numberOfOrganizations) {
        let multiOrgPrice = getMultiOrgPrice(body.numberOfOrganizations, subscriptionSettings.multiOrgPricing);
        finalPrice = (basePrice * (multiOrgPrice / 100)) * body.numberOfOrganizations;
      }
      if (userSubscription.activeSubscription.pricingPlan === 'monthly') {
        const totalDayes = getDaysInCurrentMonth();
        const pricePerDay = (finalPrice / totalDayes).toFixed(2);
        priceForRemainingDays = pricePerDay * remainingDayes;
        const totalPriceCompleteMonth = totalDayes * pricePerDay;
        priceForRemainingDays -= amountPaid;
        priceForRemainingDays = priceForRemainingDays.toFixed(2);
      }
      if (userSubscription.activeSubscription.pricingPlan === 'yearly') {
        const totalDayes = getDaysInCurrentYear();
        const pricePerDay = (finalPrice / totalDayes).toFixed(2);
        priceForRemainingDays = pricePerDay * remainingDayes;
        priceForRemainingDays -= amountPaid;
        priceForRemainingDays = priceForRemainingDays.toFixed(2);
      }
      if (body.totalSubscriptionAmount != finalPrice || body.priceForRemainingDays != priceForRemainingDays) {
        return { error: `calculated_price_mismatch expected amount is ${finalPrice} and remaining days price is ${priceForRemainingDays}` };
      }
      return { basePrice, direction: updatedSubscription.finalDirection };
    }
    if (moduleComparison.removedModules.length > 0 || body.numberOfOrganizations < userSubscription.activeSubscription.numberOfOrganizations || (body.pricingPlan !== userSubscription.activeSubscription.pricingPlan)) {
      let basePrice = 0;
      let selectedModules = body.subscriptionTypes;

      // Step 1: Calculate base price from selected modules (excluding 'analytics')
      const modulesToInclude = selectedModules.filter(module => module !== 'analytics');
      basePrice += calculateModulePrice(modulesToInclude, subscriptionSettings);


      // Step 2: Apply bundle discount for eligible modules
      const eligibleForDiscount = modulesToInclude;
      let bundleDiscount = 0;
      if (eligibleForDiscount.length === 2) {
        bundleDiscount = subscriptionSettings.bundleDiscounts.twoModules;
      } else if (eligibleForDiscount.length === 3) {
        bundleDiscount = subscriptionSettings.bundleDiscounts.threeModules;
      }

      // Step 3: Apply bundle discount
      let priceAfterBundleDiscount = basePrice - (basePrice * (bundleDiscount / 100));

      // Step 4: Add 'analytics' module price if included
      if (selectedModules.includes('analytics')) {
        const analyticsModule = subscriptionSettings.modulePricing.find(item => item.module === 'analytics');
        if (analyticsModule) {
          priceAfterBundleDiscount += analyticsModule.price;
        }
      }

      // Step 5: Apply multi-organization pricing based on number of organizations
      const multiOrgPricing = subscriptionSettings.multiOrgPricing;
      let multiOrgPrice = getMultiOrgPrice(body.numberOfOrganizations, multiOrgPricing);


      // Step 6: Apply multi-org pricing to the final base price
      let finalBasePrice = priceAfterBundleDiscount * (multiOrgPrice / 100);
      finalBasePrice *= body.numberOfOrganizations; // Adjust price based on the number of organizations

      // Step 7: Apply yearly discount if applicable
      let finalPrice = finalBasePrice;
      if (body.pricingPlan === 'yearly') {
        finalPrice = finalBasePrice * 12; // Monthly price multiplied by 12 for yearly
        finalPrice -= (finalPrice * (subscriptionSettings.yearlyDiscount.discountPercent / 100));
      }

      // Step 8: Check if the calculated price matches the provided total subscription amount
      if (body.totalSubscriptionAmount !== finalPrice) {
        return { error: `calculated_price_mismatch expected amount is ${finalPrice}` };
      }

      // Step 9: Return the final calculated price
      return { basePrice: priceAfterBundleDiscount, direction: updatedSubscription.finalDirection };
    }
  }
  return 0
};
const updateSubscription = async (req, res) => {
  try {
    const {
      subscriptionTypes,
      pricingPlan,
      numberOfOrganizations,
      totalSubscriptionAmount,
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
  let { keyword, status = "active", date, range } = req.query;
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

module.exports = {
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions,
  resetSubscriptions
};