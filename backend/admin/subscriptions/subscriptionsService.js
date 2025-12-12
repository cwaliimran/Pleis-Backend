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





const getUserSubscriptions = async ({ timezone, page, limit, keyword, status,  date, range,billing }) => {
      const skip = limit === 0 ? 0 : (page - 1) * limit;
      const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
      let { subscriptions, meta } = await SubscriptionRepo.getUserSubscriptions({ timezone, page, limit, keyword, status,  date, range, today, skip, billing });

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
  // Fetch the existing user subscription
  let UserSubscription = await SubscriptionRepo.findUserSubscriptionById(id);

  data = data.subscription;
  UserSubscription = UserSubscription.subscription;

  if (!UserSubscription) {
    return { error: "subscription_not_found" };
  }

  if (data.startDate !== undefined) {
    UserSubscription.startDate = data.startDate;
  }

  if (data.endDate !== undefined) {
    UserSubscription.endDate = data.endDate;
  }

  if (data.orderingCommission !== undefined) {
    UserSubscription.orderingCommission = data.orderingCommission;
  }

  if (data.ticketingCommission !== undefined) {
    UserSubscription.ticketingCommission = data.ticketingCommission;
  }

  if (data.reservationCommission !== undefined) {
    UserSubscription.reservationCommission = data.reservationCommission;
  }
   if (data.status !== undefined) {
    UserSubscription.status = data.status;
  }


  // -------------------------------------------------
  // Fields that require totalSubscriptionAmount if they are actually changed
  // -------------------------------------------------
  let isSubscriptionChanged = false;
  // Check if subscription types, pricing plan, or number of organizations have changed
  if (
    data.subscriptionTypes !== undefined &&
    JSON.stringify(data.subscriptionTypes) !== JSON.stringify(UserSubscription.subscriptionTypes)
  ) {
    isSubscriptionChanged = true;

    UserSubscription.subscriptionTypes = data.subscriptionTypes;
  }

  if (
    data.pricingPlan !== undefined &&
    data.pricingPlan !== UserSubscription.pricingPlan
  ) {
    isSubscriptionChanged = true;
    UserSubscription.pricingPlan = data.pricingPlan;
  }

  if (
    data.numberOfOrganizations !== undefined &&
    data.numberOfOrganizations !== UserSubscription.numberOfOrganizations
  ) {
    isSubscriptionChanged = true;
    UserSubscription.numberOfOrganizations = data.numberOfOrganizations;
  }

  // If there are any changes in the above fields, the user must provide totalSubscriptionAmount
  if (isSubscriptionChanged) {
    if (data.totalSubscriptionAmount === undefined) {
      return { error: "totalSubscriptionAmount_required" }; // Error if totalSubscriptionAmount is missing
    }

    // Only update totalSubscriptionAmount if the new value is different
    if (data.totalSubscriptionAmount !== UserSubscription.totalSubscriptionAmount) {
      UserSubscription.totalSubscriptionAmount = data.totalSubscriptionAmount;
    }
  }

  // -------------------------------------------------
  // Smart merge for modulePricing
  // -------------------------------------------------
  if (data.modulePricing !== undefined) {
    const incoming = data.modulePricing;
    const existing = UserSubscription.modulePricing || [];
    const merged = [...existing];

    for (const newItem of incoming) {
      const index = merged.findIndex(m => m.module === newItem.module);
      if (index !== -1) {
        merged[index] = { ...merged[index], ...newItem };
      } else {
        merged.push(newItem);
      }
    }

    UserSubscription.modulePricing = merged;
  }

  // -------------------------------------------------
  // Validate commissions based on modules
  // -------------------------------------------------
  if (data.commissions !== undefined) {
    const c = data.commissions;
    const finalModules = (UserSubscription.modulePricing || []).map(m => m.module);

    // Commission validation for ordering and reservations modules
    if (c.orderingCommission !== undefined) {
      if (!finalModules.includes("ordering")) {
        return { error: "ordering_module_required_for_orderingCommission" };
      }
    }

    if (c.reservationCommission !== undefined) {
      if (!finalModules.includes("reservations")) {
        return { error: "reservations_module_required_for_reservationCommission" };
      }
    }

    // No restrictions for ticketingCommission
    UserSubscription.commissions = c;
  }

  // -------------------------------------------------
  // Save updated subscription in the user model
  // -------------------------------------------------
  const user = await SubscriptionRepo.findById(id);
  if (!user) {
    return { error: "user_not_found" };
  }
  // Ensure the user subscription is properly updated with the new subscription data
  user.subscription = UserSubscription;  // Assign updated subscription to the user model

  // Save the user object with the updated subscription
  await user.save();

  // Save the updated UserSubscription object itself
  await UserSubscription.save();
  return UserSubscription;
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