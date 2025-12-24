
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
const updateSubscription = async (req, res) => {
  try {
    const {
      subscriptionTypes,
      pricingPlan,
      numberOfOrganizations,
      totalSubscriptionAmount,
    } = req.body;

    /* ================= CONSTANTS ================= */

    const ALLOWED_SUBSCRIPTION_TYPES = [
      "free",
      "ordering",
      "loyalty",
      "reservations",
      "analytics",
    ];

    const ALLOWED_PRICING_PLANS = ["monthly", "yearly"];

    /* ================= VALIDATION ================= */

    const updatePayload = {};
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

module.exports = {
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions,
};