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

const createSubscription = async (data) => {
  let Subscription = await SubscriptionRepo.createSubscription(data);
  return Subscription;
};

// Populate venue data for Subscriptions (updated for new schema)
const getSubscriptions = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { Subscriptions, meta } = await SubscriptionRepo.getSubscriptions({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip });

  return {
    Subscriptions,
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
const updateSubscription = async (id, data) => {
  const subscription = await SubscriptionRepo.findSubscriptionById(id);
  if (!subscription) {
    return { error: "subscription_not_found" };
  }

  const allowedFields = [
    "modulePricing",
    "bundleDiscounts",
    "multiOrgPricing",
    "yearlyDiscount",
    "commissions"
  ];

  const updateData = {};

  // -------------------------------------------------
  // SMART MERGE: modulePricing
  // -------------------------------------------------
  if (data.modulePricing !== undefined) {
    const incoming = data.modulePricing;
    const existing = subscription.modulePricing || [];
    const merged = [...existing];

    for (const newItem of incoming) {
      const index = merged.findIndex(m => m.module === newItem.module);

      if (index !== -1) {
        merged[index] = { ...merged[index], ...newItem };
      } else {
        merged.push(newItem);
      }
    }

    subscription.modulePricing = merged;
  }

  // Get final module list AFTER merge
  const finalModules = (subscription.modulePricing || []).map(m => m.module);

  // -------------------------------------------------
  // COMMISSION VALIDATION RULES
  // -------------------------------------------------
  if (data.commissions !== undefined) {
    const c = data.commissions;

    // ❌ orderingCommission NOT allowed unless ordering module exists
    if (c.orderingCommission !== undefined) {
      if (!finalModules.includes("ordering")) {
        return { error: "ordering_module_required_for_orderingCommission" };
      }
    }

    // ❌ reservationCommission NOT allowed unless reservations module exists
    if (c.reservationCommission !== undefined) {
      if (!finalModules.includes("reservations")) {
        return { error: "reservations_module_required_for_reservationCommission" };
      }
    }

    // ✔ ticketingCommission ALWAYS allowed (no checks)
    subscription.commissions = data.commissions;
  }

  // -------------------------------------------------
  // OTHER SIMPLE FIELDS
  // -------------------------------------------------
  for (const key of allowedFields) {
    if (key === "modulePricing" || key === "commissions") continue;

    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length > 0) {
    Object.assign(subscription, updateData);
  }

  await subscription.save();
  return subscription;
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


const getSubscriptionDetails = async (id) => {
      const Subscription = await SubscriptionRepo.findSubscriptionById(id);
      if (!Subscription) return null;
      return Subscription;
    };





const getUserSubscriptions = async ({selectedRange, timezone, page, limit, keyword, status,  date, range,billing,subscriptionTypes }) => {
      const skip = limit === 0 ? 0 : (page - 1) * limit;
      const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
      let { subscriptions, meta } = await SubscriptionRepo.getUserSubscriptions({selectedRange, timezone, page, limit, keyword, status,  date, range, today, skip, billing, subscriptionTypes });

      return {
        subscriptions,
        meta
      };
    };

const updateUserSubscriptionStatus = async (id, value) => {
      const updated = await UserSubscriptions.findByIdAndUpdate(id, {
        SubscriptionStatus: value,
      });
      if (!updated) return null;
      return true;
    };



// const updateUserSubscription = async (data) => {
//   const UserSubscription = await SubscriptionRepo.findUserSubscriptionById(data.id);

// return

//   const allowedFields = [
//     "firstName",
//     "lastName",
//     "phoneNumber",
//     "partySize",
//     "SubscriptionType",
//     "timingSlots",
//     "notes",
//   ];

//   if (data.timingSlots) {
//     if (!UserSubscription.timingSlots) {
//       UserSubscription.timingSlots = { enabled: false, dateTimeSlots: [] };
//     }

//     if (data.timingSlots.enabled !== undefined) {
//       UserSubscription.timingSlots.enabled = data.timingSlots.enabled;
//     }

//     if (Array.isArray(data.timingSlots.dateTimeSlots)) {
//       UserSubscription.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
//     }
//   }

//   const updateData = {};
//   for (const key of allowedFields) {
//     if (data[key] !== undefined && key !== "timingSlots") {
//       updateData[key] = data[key];
//     }
//   }

//   Object.assign(UserSubscription, updateData);

//   await UserSubscription.save();

//   return {
//     message: "Subscription updated successfully",
//     Subscription: UserSubscription
//   };
// };

const updateUserSubscriptions = async (id, data) => {
  try {
    let UserSubscription = await SubscriptionRepo.findUserSubscriptionById(id);

    if (!UserSubscription) {
      return { error: "subscription_not_found" };
    }
    const subscriptionData = data.subscription;
if(data.subscription.subscriptionTypes||data.subscription.pricingPlan||data.subscription.numberOfOrganizations){
    const hasSubscriptionChanged =
      (subscriptionData.subscriptionTypes && subscriptionData.subscriptionTypes.length !== UserSubscription.activeSubscription.subscriptionTypes.length) ||
      (subscriptionData.pricingPlan !== UserSubscription.activeSubscription.pricingPlan) ||
      (subscriptionData.numberOfOrganizations !== UserSubscription.activeSubscription.numberOfOrganizations);

    if (hasSubscriptionChanged && subscriptionData.totalSubscriptionAmount === undefined) {
      return { error: "totalSubscriptionAmount_is_required_when_subscription_changes" };
    }
  }

    if (subscriptionData.endDate !== undefined) {
      const currentEndDate = new Date(UserSubscription.activeSubscription.endDate);
      const newEndDate = new Date(subscriptionData.endDate);
      if (newEndDate.getTime() <= currentEndDate.getTime()) {
        return { error: "expiry_date_must_be_later_than_current" };
      }
      UserSubscription.endDate = newEndDate;
    }

    Object.keys(subscriptionData).forEach((key) => {
      if (subscriptionData[key] !== undefined && key !== "endDate") {
        UserSubscription[key] = subscriptionData[key];
      }
    });

    UserSubscription.activeSubscription = {
      ...UserSubscription.activeSubscription,
      ...subscriptionData,
    };

    UserSubscription = await UserSubscription.save({ new: true });

    return UserSubscription;

  } catch (err) {

    throw err;
  }
};








  module.exports = {
    createSubscription,
    getSubscriptions,
    updateSubscription,
    getSubscriptionDetails,
    deleteSubscription,
    getUserSubscriptions,
    updateUserSubscriptionStatus,
    getavailableSubscriptions,
    updateUserSubscriptions
  };