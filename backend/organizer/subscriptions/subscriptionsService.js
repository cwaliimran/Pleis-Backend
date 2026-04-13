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
const { User } = require("@UsersModel");
const { subscriptionUpdatedEmailTemplate } = require("@utils/emailTemplates");
const { sendEmailViaMailgun } = require("@utils/emailUtil");
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






const updateSubscription = async (data) => {

  const user = await User.findById(data.userId);
  const subscriptionSetting = await SubscriptionRepo.getSubscriptionSettings();
  if (!user) return { error: "user_not_found" };
  const isFreeSubscription =
    user.activeSubscription &&
    user.activeSubscription.subscriptionTypes?.length === 1 &&
    user.activeSubscription.subscriptionTypes[0] === "free" &&
    user.activeSubscription.endDate === null;
  const now = new Date();
  let mBody


  const {
    subscriptionTypes,
    pricingPlan,
    numberOfOrganizations,
    totalSubscriptionAmount,
    basePrice,
    direction,
    status
  } = data;
  // --------------------------------------------------
  // 🆕 FIRST-TIME SUBSCRIPTION
  // --------------------------------------------------
  // 🆕 FIRST-TIME SUBSCRIPTION
  if (direction === "new") {
    if (!user.activeSubscription || isFreeSubscription || user.activeSubscription.status === "inactive") {
      if (
        !subscriptionTypes ||
        !pricingPlan ||
        !numberOfOrganizations ||
        !status ||
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
        basePrice,
        status: status,
        startDate,
        endDate,
        orderingCommission: subscriptionSetting.commissions.orderingCommission,
        ticketingCommission: subscriptionSetting.commissions.ticketingCommission,
        reservationCommission: subscriptionSetting.commissions.reservationCommission,
      };
      user.inActiveSubscription = {
        subscriptionTypes,
        pricingPlan,
        numberOfOrganizations,
        totalSubscriptionAmount,
        basePrice,
        status: status,
        startDate,
        endDate,
        orderingCommission: subscriptionSetting.commissions.orderingCommission,
        ticketingCommission: subscriptionSetting.commissions.ticketingCommission,
        reservationCommission: subscriptionSetting.commissions.reservationCommission,
      };
      await user.save();
      mBody = subscriptionUpdatedEmailTemplate({
        username: `${user.firstName} ${user.lastName}`,
        title: "Subscription Success! Your Plan is Now Active",
        subscription: user.activeSubscription,
      });
      await sendEmailViaMailgun([user.email], "Subscription Success! Your Plan is Now Active", mBody);

      return {
        user, message: "subscription_created_for_first_time"
      };
    }
  }

  // --------------------------------------------------
  // EXISTING SUBSCRIPTION LOGIC
  // --------------------------------------------------
  const active = user.activeSubscription;
  const inactive = user.inActiveSubscription;

  // --------------------------------------------------
  // 🔼 UPGRADE → ACTIVE
  // --------------------------------------------------
  if (direction === "Increase") {
    active.subscriptionTypes = subscriptionTypes;
    active.numberOfOrganizations = numberOfOrganizations;
    active.totalSubscriptionAmount = totalSubscriptionAmount;
    active.basePrice = basePrice;
    active.status = "active";
    active.startDate = now;
    if (totalSubscriptionAmount) {
      active.pricingPlan = pricingPlan;
      const end = new Date(now);
      if (pricingPlan === "monthly") end.setMonth(end.getMonth() + 1);
      if (pricingPlan === "yearly") end.setFullYear(end.getFullYear() + 1);
      active.endDate = end;
      active.orderingCommission = subscriptionSetting.commissions.orderingCommission;
      active.ticketingCommission = subscriptionSetting.commissions.ticketingCommission;
      active.reservationCommission = subscriptionSetting.commissions.reservationCommission;
    }
    user.inActiveSubscription = {
      subscriptionTypes: subscriptionTypes,
      pricingPlan: pricingPlan,
      basePrice: basePrice,
      numberOfOrganizations: numberOfOrganizations,
      totalSubscriptionAmount: totalSubscriptionAmount,
      status: "inactive",
      startDate: now,
      endDate: null,
      orderingCommission: subscriptionSetting.commissions.orderingCommission,
      ticketingCommission: subscriptionSetting.commissions.ticketingCommission,
      reservationCommission: subscriptionSetting.commissions.reservationCommission,
    };

    await user.save();
    mBody = subscriptionUpdatedEmailTemplate({
      username: `${user.firstName} ${user.lastName}`,
      title: "Subscription Updated! Your Plan has been Upgraded",
      subscription: user.activeSubscription,
    });
    await sendEmailViaMailgun([user.email], "Subscription Updated! Your Plan has been Upgraded", mBody);

    return { success: true, updated: "active" };
  }

  // --------------------------------------------------
  // 🔽 DOWNGRADE → INACTIVE
  // --------------------------------------------------
  if (direction === "Decrease") {
    user.inActiveSubscription = {
      subscriptionTypes: subscriptionTypes,
      pricingPlan: pricingPlan,
      basePrice,
      numberOfOrganizations: numberOfOrganizations,
      totalSubscriptionAmount,
      status: "inactive",
      startDate: now,
      endDate: null,
      orderingCommission: subscriptionSetting.commissions.orderingCommission,
      ticketingCommission: subscriptionSetting.commissions.ticketingCommission,
      reservationCommission: subscriptionSetting.commissions.reservationCommission,
    };

    await user.save();
    mBody = subscriptionUpdatedEmailTemplate({
      username: `${user.firstName} ${user.lastName}`,
      title: "We Noted Your Plan  It Will Apply After Your Current Subscription Ends",
      subscription: user.inActiveSubscription,
    });
  await sendEmailViaMailgun([user.email], "We Noted Your Plan  It Will Apply After Your Current Subscription Ends", mBody);
  return { success: true, updated: "inactive" };
}

return { success: true, message: "no_changes_detected" };
};

const getSubscriptionSettings = async () => {
  let subscriptionSettings = await SubscriptionRepo.getSubscriptionSettings();
  return subscriptionSettings;
};
const getUserSubscription = async (userId) => {
  return await SubscriptionRepo.findById(userId);
}
const resetSubscriptions = async ({ userId }) => {

  const user = await User.findById(userId);

  const pricingPlan = "monthly";

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
    subscriptionTypes: [
      "free"
    ],
    pricingPlan: "monthly",
    numberOfOrganizations: 1,
    totalSubscriptionAmount: 0,
    basePrice: 0,
    status: "active",
    startDate,
    endDate: null,
  };
  user.inActiveSubscription = {
    subscriptionTypes: [
      "free"
    ],
    pricingPlan: "monthly",
    numberOfOrganizations: 1,
    totalSubscriptionAmount: 0,
    basePrice: 0,
    status: "active",
    startDate,
    endDate: null,
  };
  await user.save();

  return user.activeSubscription
}
module.exports = {
  getUserSubscriptions,
  deleteSubscription,
  updateSubscription,
  getavailableSubscriptions,
  getSubscriptionSettings,
  getUserSubscription,
  resetSubscriptions

};