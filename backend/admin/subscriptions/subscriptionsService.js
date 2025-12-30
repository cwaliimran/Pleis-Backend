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
    // Fetch the existing user subscription
    let UserSubscription = await SubscriptionRepo.findUserSubscriptionById(id);

    // If subscription is not found, return error
    if (!UserSubscription) {
      return { error: "subscription_not_found" };
    }

    // Extract subscription data from the input
    const subscriptionData = data.subscription;
    console.log("subscriptionData====>", UserSubscription);

    // Start updating fields only if they are provided in subscriptionData

    // Check for and update subscriptionTypes only if provided
    if (subscriptionData.subscriptionTypes !== undefined) {
      console.log("Updating subscriptionTypes to:", subscriptionData.subscriptionTypes);
      UserSubscription.subscriptionTypes = subscriptionData.subscriptionTypes;
    }

    if (subscriptionData.pricingPlan !== undefined) {
      UserSubscription.pricingPlan = subscriptionData.pricingPlan;
    }

    if (subscriptionData.numberOfOrganizations !== undefined) {
      UserSubscription.numberOfOrganizations = subscriptionData.numberOfOrganizations;
    }

    if (subscriptionData.totalSubscriptionAmount !== undefined) {
      UserSubscription.totalSubscriptionAmount = subscriptionData.totalSubscriptionAmount;
    }

    if (subscriptionData.status !== undefined) {
      UserSubscription.status = subscriptionData.status;
    }

    if (subscriptionData.orderingCommission !== undefined) {
      UserSubscription.orderingCommission = subscriptionData.orderingCommission;
    }

    if (subscriptionData.ticketingCommission !== undefined) {
      UserSubscription.ticketingCommission = subscriptionData.ticketingCommission;
    }

    if (subscriptionData.reservationCommission !== undefined) {
      UserSubscription.reservationCommission = subscriptionData.reservationCommission;
    }

    if (subscriptionData.startDate !== undefined) {
      UserSubscription.startDate = subscriptionData.startDate;
    }

    if (subscriptionData.endDate !== undefined) {
      UserSubscription.endDate = subscriptionData.endDate;
    }

    // // Now fetch the user to update the subscription in the user model
    // const user = await SubscriptionRepo.findById(id);
    // if (!user) {
    //   return { error: "user_not_found" };
    // }

    // Update the user's activeSubscription with the new subscription data
    UserSubscription.activeSubscription = {
      ...UserSubscription.activeSubscription, // Retain any existing values
      // subscriptionTypes: UserSubscription.subscriptionTypes,
      pricingPlan: UserSubscription.pricingPlan,
      numberOfOrganizations: UserSubscription.numberOfOrganizations,
      totalSubscriptionAmount: UserSubscription.totalSubscriptionAmount,
      orderingCommission: UserSubscription.orderingCommission,
      ticketingCommission: UserSubscription.ticketingCommission,
      reservationCommission: UserSubscription.reservationCommission,
      status: UserSubscription.status,
      startDate: UserSubscription.startDate,
      endDate: UserSubscription.endDate,
    };

    console.log("Updated user activeSubscription", UserSubscription.activeSubscription);
    
    // Save the user object with the updated activeSubscription
   UserSubscription = await UserSubscription.save({new: true});

    // Optionally, save the updated UserSubscription object (if required by your logic)
    // await UserSubscription.save();

    console.log("Updated UserSubscription", UserSubscription);

    // Return the updated subscription
    return UserSubscription;

  } catch (err) {
    console.error("Error updating subscription:", err);
    throw err; // Throw the error to be handled by higher-level middleware or logging
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