// repositories/SubscriptionRepository.js
const { SubscriptionSettings }  = require("@SubscriptionSettings");

const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
// const { SubscriptionsFormatter, SubscriptionsFormatterAdjustDates } = require("../../app/Subscriptions/formaters/SubscriptionFormetter");
const Organizations = require("@OrganizationModel")
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
  getStartAndEndOfDay,
  getCurrentDateInTimezone,
  convertTimezoneToUtcDateOnly,
  getCurrentUtcDateOnly,
} = require("../../helperUtils/responseUtil");

const createSubscription = async (data) => {
  try {

    const existing = await SubscriptionSettings.findOne({});
    if (existing) {
      const err = new Error("subscription_settings_already_exists");
      err.statusCode = 400;
      throw err;
    }
    const subscription = new SubscriptionSettings(data);
    await subscription.save();
    return subscription;

  } catch (err) {
    throw err;
  }
};



// Get all Subscriptions with their assigned organization populated, sorted by createdAt descending
const getSubscriptionsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Subscriptions.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countSubscriptions = async (query = {}) => {
  return Subscriptions.countDocuments(query);
};

// Find by ID
const findSubscriptionById = async (id) => {
  return SubscriptionSettings.findById(id);
};

// Update and save
const updateSubscriptionData = async (Subscription, data) => {
  Object.assign(Subscription, data);
  return await Subscription.save();
};

// Delete
const deleteSubscriptionById = async (Subscription) => {
  return await Subscription.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Subscriptions.findByIdAndUpdate(id, data, { new: true });
};




const getSubscriptions = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip }) => {
  const now = getCurrentDateInTimezone({ timezone });
console.log("date",date );

  let organizationsIds = Array.isArray(organizationsId)
    ? organizationsId
    : JSON.parse(organizationsId || '[]');
  organizationsIds = organizationsIds.map(id => new mongoose.Types.ObjectId(id));
  const pipeline = [
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
        ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }) // Match as ObjectId
      }
    }
  ];
  if (range == "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }
  if (range == "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }
  if (range == "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }
  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    let { start, end } = getStartAndEndOfDay(date, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: Subscriptions.schema }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });
  const result = await Subscriptions.aggregate(pipeline);
  console.log("pipeline",pipeline );

  let Subscriptions = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
console.log("Subscriptions",Subscriptions );
  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Subscriptions.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    Subscriptions.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    Subscriptions.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.SubscriptionsCount = { total, active, inactive };


  Subscriptions = Subscriptions.map(item => {
    const formatted = SubscriptionsFormatter(item);
    if (formatted.conditionType == "noCondition" || formatted.conditionType == "ticketRequirement" || formatted.conditionType == "customText" || formatted.conditionType == "ticketRequirement") {
      delete formatted.amount;
      if (formatted.conditionType == "noCondition") {
        delete formatted.ticketType;
      }
    }
    else {
      delete formatted.ticketType;
    }
    return formatted;
  });
  return { Subscriptions, meta }
}


const getUserSubscriptions = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  date,
  range,
  skip,
  billing
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [
    // ------------------------------------------------------
    // 1) Fetch users who have a subscription object
    // ------------------------------------------------------
    {
      $match: {
        // subscription: { $exists: true }
      }
    },



    // ------------------------------------------------------
    // 3) Flatten subscription data for filtering
    // ------------------------------------------------------
    {
      $addFields: {
        subscriptionTypes: "$subscription.subscriptionTypes",
        pricingPlan: "$subscription.pricingPlan",
        numberOfOrganizations: "$subscription.numberOfOrganizations",
        totalSubscriptionAmount: "$subscription.totalSubscriptionAmount",
        startDate: "$subscription.startDate",
        endDate: "$subscription.endDate",

        // Auto-calc status (active/expired)
        subscriptionStatus: {
          $cond: {
            if: { $and: ["$subscription.endDate", { $lte: ["$subscription.endDate", now] }] },
            then: "expired",
            else: "active"
          }
        }
      }
    }
  ];

  // ------------------------------------------------------
  // RANGE FILTERS BASED ON SUBSCRIPTION START DATE
  // ------------------------------------------------------
  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);
    pipeline.push({ $match: { startDate: { $gte: start, $lt: end } } });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);
    pipeline.push({ $match: { startDate: { $gte: start, $lt: end } } });
  }

  if (range === "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({ $match: { startDate: { $gte: start, $lt: end } } });
  }

  // ------------------------------------------------------
  // STATUS FILTER
  // ------------------------------------------------------
if (status) {
  // Match subscription status as per user's input
  pipeline.push({ $match: { "subscription.status": status } });
} else {
  // If no status provided, match active or expired subscriptions
  pipeline.push({
    $match: {
      "subscription.status": { $ne: "deleted" }  // Do not include deleted subscriptions
    }
  });
}


  // ------------------------------------------------------
  // DATE FILTER ON startDate
  // ------------------------------------------------------
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({ $match: { startDate: { $gte: start, $lt: end } } });
  }

  // ------------------------------------------------------
  // KEYWORD SEARCH (user + subscription fields)
  // ------------------------------------------------------
  if (keyword) {
    pipeline.push({
      $match: {
        $or: [
          { firstName: new RegExp(keyword, "i") },
          { lastName: new RegExp(keyword, "i") },

        ]
      }
    });
  }
    if (billing) {
    pipeline.push({
      $match: {
        $or: [
          { pricingPlan: new RegExp(billing, "i") }
        ]
      }
    });
  }

  // ------------------------------------------------------
  // SORT BY subscription date
  // ------------------------------------------------------
  pipeline.push({ $sort: { startDate: -1 } });

  // ------------------------------------------------------
  // PAGINATION + TOTAL COUNT
  // ------------------------------------------------------
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await User.aggregate(pipeline);

  let subscriptions = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // ------------------------------------------------------
  // META COUNTS
  // ------------------------------------------------------
  const [total, active, expired] = await Promise.all([
    User.countDocuments({ subscription: { $exists: true } }),
    User.countDocuments({
      "subscription.endDate": { $gt: now }
    }),
    User.countDocuments({
      "subscription.endDate": { $lte: now }
    })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.subscriptionCount = { total, active, expired };

  // ------------------------------------------------------
  // FINAL FORMATTER (CLEAN OUTPUT)
  // ------------------------------------------------------

subscriptions = subscriptions.map((user) => {
  const amount = Number(user.totalSubscriptionAmount ?? 0);
  let monthlyPrice = amount;

  if (user.pricingPlan === "yearly") {
    monthlyPrice = amount / 12;
  }

  // Format to 2 decimals
  monthlyPrice = Number(monthlyPrice.toFixed(2));
  const finalStatus = user.subscription?.status || "active";

  // Check if subscription object exists before accessing its properties
  const subscription = user.subscription || {}; // Use an empty object if subscription is undefined

  return {
    userId: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,

    subscription: {
      subscriptionTypes: user.subscriptionTypes,
      pricingPlan: user.pricingPlan,
      numberOfOrganizations: user.numberOfOrganizations,
      totalSubscriptionAmount: amount,
      monthlyPrice,
      startDate: user.startDate,
      endDate: user.endDate,
      status: finalStatus,
      orderingCommission: subscription.orderingCommission || 0, // Default to 0 if undefined
      ticketingCommission: subscription.ticketingCommission || 0, // Default to 0 if undefined
      reservationCommission: subscription.reservationCommission || 0, // Default to 0 if undefined
    },
  };
});

  return { subscriptions, meta };
};



const findUserSubscriptionById = async (id) => {
  // Retrieve only the subscription data for the user
  const user = await User.findById(id).select('subscription');
  return user  // Return subscription or null if not found
};


const findUserById = async (id) => {
  return User.findById(id);
};





const getavailableSubscriptions = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  date,
  range,
  skip
}) => {
  const now = getCurrentUtcDateOnly();
  console.log("Entered getavailableSubscriptions");

  const pipeline = [];

  // ---------------------------------------------------------
  // RANGE FILTERS (monthly / weekly / today)
  // ---------------------------------------------------------

  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
    });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);
    console.log("Weekly range:", start, end);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
    });
  }

  if (range === "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
    });
  }



  // ---------------------------------------------------------
  // SPECIFIC DATE FILTER (using $expr + $filter)
  // ---------------------------------------------------------
  if (date) {
    const { start, end } = getStartAndEndOfDay(date, timezone);
    console.log("DATE DEBUG:", { start, end });

    pipeline.push({
      $match: {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$timingSlots.dateTimeSlots",
                  as: "slot",
                  cond: {
                    $and: [
                      { $gte: ["$$slot.date", start] },
                      { $lt: ["$$slot.date", end] }
                    ]
                  }
                }
              }
            },
            0
          ]
        }
      }
    });
  }

  // ---------------------------------------------------------
  // KEYWORD SEARCH
  // ---------------------------------------------------------
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: SubscriptionSettings.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length > 0) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // ---------------------------------------------------------
  // SORTING
  // ---------------------------------------------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // ---------------------------------------------------------
  // PAGINATION USING FACET
  // ---------------------------------------------------------
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });



  const result = await SubscriptionSettings.aggregate(pipeline);

  const subscriptions = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // ---------------------------------------------------------
  // META COUNTS
  // ---------------------------------------------------------
  const [total, active, inactive] = await Promise.all([
    SubscriptionSettings.countDocuments({ status: { $ne: "deleted" } }),
    SubscriptionSettings.countDocuments({ status: "active" }),
    SubscriptionSettings.countDocuments({ status: "inactive" })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.subscriptionsCount = { total, active, inactive };

  return { subscriptions, meta };
};

const findByIdAndDelete = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.subscription) {
      user.subscription.status = "cancelled";
      await user.save();
      return user;  
    } else {
      throw new Error("User does not have a subscription");
    }

  } catch (err) {
    throw err;
  }
};



module.exports = {
  createSubscription,
  getSubscriptionsWithFilters,
  countSubscriptions,
  findSubscriptionById,
  updateSubscriptionData,
  deleteSubscriptionById,
  findByIdAndUpdate,
  getSubscriptions,
  getUserSubscriptions,
  findUserSubscriptionById,
  findUserById,
  getavailableSubscriptions,
  findByIdAndDelete
};