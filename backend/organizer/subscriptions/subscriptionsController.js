
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


  if (userSubscription.activeSubscription.subscriptionTypes.includes('free') || userSubscription.activeSubscription.status == "inactive" || userSubscription.activeSubscription.endDate == null) {
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
    if (Number(body.totalSubscriptionAmount).toFixed(2) !== Number(finalPrice).toFixed(2)) {
      return { error: `calculated_price_mismatch expected amount is ${finalPrice}` };
    }
    // Step 9: Return the final calculated price
    return { basePrice: priceAfterBundleDiscount, direction: "new" };
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

    if (updatedSubscription.finalDirection === 'Increase') {
      if (moduleComparison.addedModules?.length > 0 || body.numberOfOrganizations > userSubscription.activeSubscription.numberOfOrganizations) {
        let basePrice = userSubscription.activeSubscription.basePrice;
        if (body.subscriptionTypes.includes("free")) {
          basePrice = 0;
          return { basePrice, direction: updatedSubscription.finalDirection };
        }

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
        else {
          finalPrice = basePrice * body.numberOfOrganizations;
        }
        if (userSubscription.activeSubscription.pricingPlan === 'monthly') {
          const totalDayes = getDaysInCurrentMonth();
          const remainingAmount = finalPrice - amountPaid;
          const pricePerDay = (remainingAmount / totalDayes);
          priceForRemainingDays = (pricePerDay * remainingDayes).toFixed(2);
        }
        if (userSubscription.activeSubscription.pricingPlan === 'yearly') {
          const totalDayes = getDaysInCurrentYear();
          const priceFor =finalPrice *12;
          let remainingAmount = priceFor - amountPaid;
          remainingAmount -= (remainingAmount * (subscriptionSettings.yearlyDiscount.discountPercent / 100))
          const pricePerDay = (remainingAmount / totalDayes);
          priceForRemainingDays = (pricePerDay * remainingDayes).toFixed(2);

        }
        if (
          Number(body.totalSubscriptionAmount).toFixed(2) !== Number(finalPrice).toFixed(2) ||
          Number(body.priceForRemainingDays).toFixed(2) !== Number(priceForRemainingDays).toFixed(2)
        ) {
          return {
            error: `calculated_price_mismatch_expected_amount_is_${Number(finalPrice).toFixed(2)}_and_remaining_days_price_is_${Number(priceForRemainingDays).toFixed(2)}`
          };
        }
        return { basePrice, direction: updatedSubscription.finalDirection };
      }
    }
    if (updatedSubscription.finalDirection === 'Decrease') {
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
        if (Number(body.totalSubscriptionAmount).toFixed(2) !== Number(finalPrice).toFixed(2)) {
          return { error: `calculated_price_mismatch expected amount is ${finalPrice}` };
        }

        // Step 9: Return the final calculated price
        return { basePrice: priceAfterBundleDiscount, direction: updatedSubscription.finalDirection };
      }
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
console.log(" req.user._id", req.user._id );
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