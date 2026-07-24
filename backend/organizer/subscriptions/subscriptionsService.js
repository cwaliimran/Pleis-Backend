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
const {
  User,
  SubscriptionTypes,
  SubscriptionPaymentStatuses,
} = require("@UsersModel");

const PAID_MODULE_TYPES = Object.values(SubscriptionTypes).filter(
  (type) => type !== SubscriptionTypes.FREE
);

const mergeSubscriptionTypePayments = (
  previousPayments = [],
  subscriptionTypes = []
) => {
  const types = [...new Set(subscriptionTypes)];
  const byType = new Map(
    (previousPayments || []).map((payment) => [
      payment.subscriptionType,
      payment,
    ])
  );

  const merged = [];

  if (types.includes(SubscriptionTypes.FREE)) {
    const existing = byType.get(SubscriptionTypes.FREE);
    merged.push(
      existing || {
        subscriptionType: SubscriptionTypes.FREE,
        status: SubscriptionPaymentStatuses.NOT_REQUIRED,
        amount: 0,
        currency: "EUR",
      }
    );
  }

  for (const subscriptionType of types) {
    if (subscriptionType === SubscriptionTypes.FREE) {
      continue;
    }

    const existing = byType.get(subscriptionType);
    merged.push(
      existing || {
        subscriptionType,
        status: SubscriptionPaymentStatuses.PENDING,
        amount: 0,
        currency: "EUR",
        paymentReference: null,
        providerTransactionId: null,
        paidAt: null,
        failedAt: null,
        failureReason: null,
      }
    );
  }

  return merged;
};

const attachSubscriptionTypePayments = (subscription, previousPayments) => {
  if (!subscription) {
    return;
  }

  subscription.subscriptionTypePayments = mergeSubscriptionTypePayments(
    previousPayments,
    subscription.subscriptionTypes
  );
};

const findSubscriptionsContainingType = (user, subscriptionType) => {
  const matches = [];

  if (user.activeSubscription?.subscriptionTypes?.includes(subscriptionType)) {
    matches.push(user.activeSubscription);
  }

  if (
    user.inActiveSubscription?.subscriptionTypes?.includes(subscriptionType)
  ) {
    matches.push(user.inActiveSubscription);
  }

  return matches;
};

const applySubscriptionTypePaymentUpdate = (subscription, data) => {
  if (!subscription.subscriptionTypePayments) {
    subscription.subscriptionTypePayments = [];
  }

  const existingPayment = subscription.subscriptionTypePayments.find(
    (payment) => payment.subscriptionType === data.subscriptionType
  );

  if (!existingPayment) {
    subscription.subscriptionTypePayments.push({
      subscriptionType: data.subscriptionType,
      status: data.status,
      paymentReference: data.paymentReference || null,
      providerTransactionId: data.providerTransactionId || null,
      amount: data.amount ?? 0,
      currency: data.currency || "EUR",
      paidAt: data.status === SubscriptionPaymentStatuses.PAID ? new Date() : null,
      failedAt:
        data.status === SubscriptionPaymentStatuses.FAILED ? new Date() : null,
      failureReason:
        data.status === SubscriptionPaymentStatuses.FAILED
          ? data.failureReason || null
          : null,
    });
    return;
  }

  existingPayment.status = data.status;

  if (data.paymentReference !== undefined) {
    existingPayment.paymentReference = data.paymentReference;
  }

  if (data.providerTransactionId !== undefined) {
    existingPayment.providerTransactionId = data.providerTransactionId;
  }

  if (data.amount !== undefined) {
    existingPayment.amount = data.amount;
  }

  if (data.currency !== undefined) {
    existingPayment.currency = data.currency;
  }

  if (data.status === SubscriptionPaymentStatuses.PAID) {
    existingPayment.paidAt = new Date();
    existingPayment.failedAt = null;
    existingPayment.failureReason = null;
  }

  if (data.status === SubscriptionPaymentStatuses.FAILED) {
    existingPayment.failedAt = new Date();
    existingPayment.paidAt = null;
    existingPayment.failureReason = data.failureReason || null;
  }

  if (
    data.status === SubscriptionPaymentStatuses.PENDING ||
    data.status === SubscriptionPaymentStatuses.PROCESSING
  ) {
    existingPayment.paidAt = null;
    existingPayment.failedAt = null;
    existingPayment.failureReason = null;
  }

  if (
    data.status === SubscriptionPaymentStatuses.CANCELLED ||
    data.status === SubscriptionPaymentStatuses.REFUNDED
  ) {
    existingPayment.failureReason = data.failureReason || null;
  }
};
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
      const previousActivePayments =
        user.activeSubscription?.subscriptionTypePayments;
      const previousInactivePayments =
        user.inActiveSubscription?.subscriptionTypePayments;
      user.activeSubscription = {
        subscriptionTypes: [...new Set(subscriptionTypes)],
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
      attachSubscriptionTypePayments(
        user.activeSubscription,
        previousActivePayments
      );
      user.inActiveSubscription = {
        subscriptionTypes: [...new Set(subscriptionTypes)],
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
      attachSubscriptionTypePayments(
        user.inActiveSubscription,
        previousInactivePayments
      );
      await user.save();
      // mBody = subscriptionUpdatedEmailTemplate({
      //   username: `${user.firstName} ${user.lastName}`,
      //   title: "Subscription Success! Your Plan is Now Active",
      //   subscription: user.activeSubscription,
      // });
      // await sendEmailViaMailgun([user.email], "Subscription Success! Your Plan is Now Active", mBody);

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
    active.subscriptionTypes = [...new Set(subscriptionTypes)];
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
    attachSubscriptionTypePayments(
      active,
      active.subscriptionTypePayments
    );
    const previousInactivePayments =
      user.inActiveSubscription?.subscriptionTypePayments;
    user.inActiveSubscription = {
      subscriptionTypes: [...new Set(subscriptionTypes)],
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
    attachSubscriptionTypePayments(
      user.inActiveSubscription,
      previousInactivePayments
    );

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
    const previousInactivePayments =
      user.inActiveSubscription?.subscriptionTypePayments;
    user.inActiveSubscription = {
      subscriptionTypes: [...new Set(subscriptionTypes)],
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
    attachSubscriptionTypePayments(
      user.inActiveSubscription,
      previousInactivePayments
    );

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

const updateUserSubscriptionPaymentStatus = async (userId, data) => {
  const user = await SubscriptionRepo.findUserById(userId);

  if (!user) {
    return {
      error: "user_not_found",
      statusCode: 404,
    };
  }

  const sharedPaymentReference = data.paymentReference;
  const sharedProviderTransactionId = data.providerTransactionId;

  const items = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    return {
      error: "subscription_payment_items_required",
      statusCode: 400,
    };
  }

  const itemTypes = items.map((item) => item.subscriptionType);
  if (new Set(itemTypes).size !== itemTypes.length) {
    return {
      error: "duplicate_subscription_type_in_payment_items",
      statusCode: 400,
    };
  }

  for (const item of items) {
    if (!item.subscriptionType) {
      return {
        error: "subscriptionType_is_required",
        statusCode: 400,
      };
    }

    if (!PAID_MODULE_TYPES.includes(item.subscriptionType)) {
      return {
        error: "invalid_subscriptionType",
        statusCode: 400,
      };
    }

    if (!item.status) {
      return {
        error: "payment_status_is_required",
        statusCode: 400,
      };
    }

    if (!Object.values(SubscriptionPaymentStatuses).includes(item.status)) {
      return {
        error: "invalid_payment_status",
        statusCode: 400,
      };
    }

    const subscriptions = findSubscriptionsContainingType(
      user,
      item.subscriptionType
    );

    if (subscriptions.length === 0) {
      return {
        error: "subscription_type_not_found_for_user",
        statusCode: 400,
      };
    }

    const paymentUpdate = {
      subscriptionType: item.subscriptionType,
      status: item.status,
      paymentReference:
        item.paymentReference !== undefined
          ? item.paymentReference
          : sharedPaymentReference,
      providerTransactionId:
        item.providerTransactionId !== undefined
          ? item.providerTransactionId
          : sharedProviderTransactionId,
      amount: item.amount,
      currency: item.currency,
      failureReason: item.failureReason,
    };

    for (const subscription of subscriptions) {
      attachSubscriptionTypePayments(
        subscription,
        subscription.subscriptionTypePayments
      );
      applySubscriptionTypePaymentUpdate(subscription, paymentUpdate);
    }
  }

  await user.save();

  return {
    userId: user._id,
    activeSubscription: user.activeSubscription,
    inActiveSubscription: user.inActiveSubscription,
  };
};

module.exports = {
  getUserSubscriptions,
  deleteSubscription,
  updateSubscription,
  getavailableSubscriptions,
  getSubscriptionSettings,
  getUserSubscription,
  resetSubscriptions,
  updateUserSubscriptionPaymentStatus

};