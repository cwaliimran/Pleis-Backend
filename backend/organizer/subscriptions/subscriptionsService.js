// services/Subscriptionservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
// const { SubscriptionsFormatter } = require("../../app/Subscriptions/formaters/SubscriptionFormetter");
// const Subscriptions = require("@SubscriptionSettings");
// const UserSubscriptions = require("@UserSubscriptionsModel");
const SubscriptionRepo = require("./subscriptionsRepository");
const mongoose = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("@utils/responseUtil");
const {User} = require("@UsersModel");
const createSubscription = async (data) => {
  let Subscription = await SubscriptionRepo.createSubscription(data);
  return Subscription;
};

// Populate venue data for Subscriptions (updated for new schema)
const getUserSubscriptions = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { subscriptions, meta } = await SubscriptionRepo.getUserSubscriptions({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip });

  return {
    subscriptions,
    meta
  };
};
const getavailableSubscriptions = async ({ timezone, page, limit, keyword, status, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { subscriptions, meta } = await SubscriptionRepo.getavailableSubscriptions({ timezone, page, limit, keyword, status, date, range, skip });

  return {
    subscriptions,
    meta
  };
};





const deleteSubscription = async (id) => {
  try {
    const deleted = await SubscriptionRepo.findByIdAndDelete(id);

    if (!deleted) {
      return null;  
    }

    return true; 
  } catch (err) {
    throw err;
  }
};




const isIncreaseInTypes = (oldTypes, newTypes) =>
  newTypes.length > oldTypes.length;

const isDecreaseInTypes = (oldTypes, newTypes) =>
  newTypes.length < oldTypes.length;

const isIncreaseInOrgs = (oldNum, newNum) =>
  newNum > oldNum;

const isDecreaseInOrgs = (oldNum, newNum) =>
  newNum < oldNum;

const isPricingPlanChanged = (oldPlan, newPlan) =>
  oldPlan !== newPlan;


const updateSubscription = async (data) => {
  const user = await User.findById(data.userId);
  if (!user) return { error: "user_not_found" };


  const now = new Date();

  const {
    subscriptionTypes,
    pricingPlan,
    numberOfOrganizations,
    totalSubscriptionAmount,
  } = data;

  // --------------------------------------------------
  // 🆕 FIRST-TIME SUBSCRIPTION
  // --------------------------------------------------
// 🆕 FIRST-TIME SUBSCRIPTION
if (!user.activeSubscription) {

  if (
    !subscriptionTypes ||
    !pricingPlan ||
    !numberOfOrganizations ||
    totalSubscriptionAmount == null
  ) {
    return { error: "missing_required_subscription_fields" };
  }

  const startDate = new Date();
  let endDate = null;

  if (pricingPlan === "monthly") {
    endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
  }

  if (pricingPlan === "yearly") {
    endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  user.activeSubscription = {
    subscriptionTypes,
    pricingPlan,
    numberOfOrganizations,
    totalSubscriptionAmount,
    status: "active",
    startDate,
    endDate, // ✅ ALWAYS SET HERE
  };

  await user.save();

  return {
    success: true,
    created: "active",
    startDate,
    endDate,
  };
}


  // --------------------------------------------------
  // EXISTING SUBSCRIPTION LOGIC
  // --------------------------------------------------
  const active = user.activeSubscription;

  const incoming = {
    subscriptionTypes: subscriptionTypes ?? active.subscriptionTypes,
    pricingPlan: pricingPlan ?? active.pricingPlan,
    numberOfOrganizations:
      numberOfOrganizations ?? active.numberOfOrganizations,
    totalSubscriptionAmount,
  };

  const increasedTypes =
    incoming.subscriptionTypes.length > active.subscriptionTypes.length;

  const decreasedTypes =
    incoming.subscriptionTypes.length < active.subscriptionTypes.length;

  const increasedOrgs =
    incoming.numberOfOrganizations > active.numberOfOrganizations;

  const decreasedOrgs =
    incoming.numberOfOrganizations < active.numberOfOrganizations;

  const pricingChanged =
    incoming.pricingPlan !== active.pricingPlan;

  const isUpgrade = increasedTypes || increasedOrgs;
  const isDowngrade = decreasedTypes || decreasedOrgs || pricingChanged;

  if ((isUpgrade || isDowngrade) && totalSubscriptionAmount == null) {
    return { error: "total_amount_required" };
  }

  // --------------------------------------------------
  // 🔼 UPGRADE → ACTIVE
  // --------------------------------------------------
  if (isUpgrade) {
    active.subscriptionTypes = incoming.subscriptionTypes;
    active.numberOfOrganizations = incoming.numberOfOrganizations;
    active.totalSubscriptionAmount = totalSubscriptionAmount;
    active.status = "active";
    active.startDate = now;

    if (pricingChanged) {
      active.pricingPlan = incoming.pricingPlan;

      const end = new Date(now);
      if (incoming.pricingPlan === "monthly") end.setMonth(end.getMonth() + 1);
      if (incoming.pricingPlan === "yearly") end.setFullYear(end.getFullYear() + 1);
      active.endDate = end;
    }

    await user.save();
    return { success: true, updated: "active" };
  }

  // --------------------------------------------------
  // 🔽 DOWNGRADE → INACTIVE
  // --------------------------------------------------
  if (isDowngrade) {
    user.inActiveSubscription = {
      subscriptionTypes: incoming.subscriptionTypes,
      pricingPlan: incoming.pricingPlan,
      numberOfOrganizations: incoming.numberOfOrganizations,
      totalSubscriptionAmount,
      status: "inactive",
      startDate: now,
      endDate: null,
    };

    await user.save();
    return { success: true, updated: "inactive" };
  }

  return { success: true, message: "no_changes_detected" };
};


  module.exports = {
    getUserSubscriptions,
    deleteSubscription,
    updateSubscription,
    getavailableSubscriptions,
  };