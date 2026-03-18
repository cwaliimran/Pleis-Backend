
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
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

    modulesToInclude.forEach(module => {
      const moduleSetting = subscriptionSettings.modulePricing.find(item => item.module === module);
      if (moduleSetting) {
        basePrice += moduleSetting.price;
      }
    });

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
      return { error: "calculated_price_mismatch" };
    }

    // Step 9: Return the final calculated price
    return { finalPrice, priceAfterBundleDiscount };
  }
  else {
    const basePrice = userSubscription.activeSubscription.basePrice;
console.log("basePrice",basePrice );
    if (body.numberOfOrganizations>userSubscription.activeSubscription.numberOfOrganizations) {
      const multiOrgPricing = subscriptionSettings.multiOrgPricing;
      let multiOrgPrice = getMultiOrgPrice(body.numberOfOrganizations, multiOrgPricing);
      let PriceAfterOrgDiscount = basePrice * (multiOrgPrice / 100);
      console.log("PriceAfterOrgDiscount", PriceAfterOrgDiscount);

    }

    // If user does not have a 'free' subscription type, return 0 or fallback logic
    return 0;  // Or any fallback logic as required
  }
};
const updateSubscription = async (req, res) => {
  try {
    const {
      subscriptionTypes,
      pricingPlan,
      numberOfOrganizations,
      totalSubscriptionAmount,
    } = req.body;
    const result = await calculateSubscriptionPrice(req.user._id, req.body);
    if (result.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error,
      });
    }
    return
    /* ================= CONSTANTS ================= */

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
    const basePrice = result.priceAfterBundleDiscount;
    updatePayload.basePrice = basePrice;
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
      console.log("subscriptionTypes", subscriptionTypes);
      for (const type of subscriptionTypes) {
        if (!ALLOWED_SUBSCRIPTION_TYPES.includes(type)) {
          console.log(`Invalid subscription type: ${type}`);
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_subscription_type",
          });
        }
      }

      updatePayload.subscriptionTypes = subscriptionTypes;
    } console.log("helo",);
    // ---- pricingPlan ----
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
          translationKey: "numberOfOrganizations_must_be_positive_integer",
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

module.exports = {
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions,
};