// repositories/SubscriptionRepository.js
const { SubscriptionSettings } = require("@SubscriptionSettings");

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


  let Subscriptions = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

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
  billing,
  selectedRange,
  subscriptionTypes
}) => {
  const now = getCurrentDateInTimezone({ timezone });
  let minOrganizations, maxOrganizations;


  const pipeline = [
    // ------------------------------------------------------
    // 1) Fetch all users who have a subscription object
    // ------------------------------------------------------
    {
      $match: {
        "activeSubscription": { $exists: true }  // Ensure activeSubscription exists
      }
    },

    // ------------------------------------------------------
    // 2) Lookup organizations to check if the user is the creator
    // ------------------------------------------------------
    {
      $lookup: {
        from: "organizations", // Join with the organizations collection
        localField: "_id", // Match user ID with creator field in organizations
        foreignField: "creator", // Match creator field in organizations
        as: "userOrganizations"
      }
    },

    // ------------------------------------------------------
    // 3) Filter users who are creators in any organization
    // ------------------------------------------------------
    {
      $match: {
        "userOrganizations.creator": { $exists: true, $ne: null } // Only include users who are creators
      }
    },

    // ------------------------------------------------------
    // 4) Flatten subscription data for filtering
    // ------------------------------------------------------
    {
      $addFields: {
        subscriptionTypes: "$activeSubscription.subscriptionTypes",
        pricingPlan: "$activeSubscription.pricingPlan",
        numberOfOrganizations: "$activeSubscription.numberOfOrganizations",
        totalSubscriptionAmount: "$activeSubscription.totalSubscriptionAmount",
        startDate: "$activeSubscription.startDate",
        endDate: "$activeSubscription.endDate",

        // Auto-calc status (active/expired)
        subscriptionStatus: "$activeSubscription.status"
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
  // STATUS FILTER
  if (status) {

    pipeline.push({
      $match: {
        "activeSubscription.status": status
      }
    });

  } else {

    // If no status is provided, exclude "deleted" subscriptions
    pipeline.push({
      $match: {
        "activeSubscription.status": { $ne: "deleted" }  // Exclude deleted subscriptions if no status is provided
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
  if (subscriptionTypes) {
    // Ensure subscriptionTypes is an array
    const subscriptionTypesArray = Array.isArray(subscriptionTypes) ? subscriptionTypes : [subscriptionTypes];
    // If 'free' is in the array, include only 'free' subscription types
    if (subscriptionTypesArray.includes("free")) {
      pipeline.push({
        $match: {
          "activeSubscription.subscriptionTypes": {
            $in: ["free"]  // Include only users with the "free" subscription type
          }
        }
      });
    } else {
      // Exclude users with "free" subscription type and return all other types
      pipeline.push({
        $match: {
          "activeSubscription.subscriptionTypes": {
            $nin: ["free"]  // Exclude users with the "free" subscription type
          }
        }
      });

    }
  }


  // Handle the selectedRange filter (e.g., "1-2", "50+", "All")
  if (selectedRange) {


    if (selectedRange === "All" || selectedRange === "all") {
      // If "All", no range filter is applied
      minOrganizations = undefined;
      maxOrganizations = undefined;
    } else if (selectedRange.includes("+")) {
      // Handle the "50+" case: set minimum organizations with no upper limit
      const min = parseInt(selectedRange.replace("+", "").trim(), 10);
      minOrganizations = min;
      maxOrganizations = undefined; // No upper limit for "+" case
    } else if (selectedRange.includes("-")) {
      // Handle the "min-max" case: split the range by "-" and apply it
      const [min, max] = selectedRange.split("-").map(str => str.trim()).map(Number);
      minOrganizations = min;
      maxOrganizations = max;
    }
  }

  // Apply the selectedRange filter for number of organizations
  if (minOrganizations !== undefined) {
    pipeline.push({
      $match: {
        "activeSubscription.numberOfOrganizations": {
          $gte: minOrganizations,
          ...(maxOrganizations !== undefined ? { $lte: maxOrganizations } : {}),
        },
      },
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
    const finalStatus = user.activeSubscription?.status || "active";

    // Check if subscription object exists before accessing its properties
    const subscription = user.activeSubscription || {}; // Use an empty object if subscription is undefined

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
        orderingCommission: user.activeSubscription.orderingCommission || 0, // Default to 0 if undefined
        ticketingCommission: user.activeSubscription.ticketingCommission || 0, // Default to 0 if undefined
        reservationCommission: user.activeSubscription.reservationCommission || 0, // Default to 0 if undefined
      },
    };
  });


  subscriptions = await Promise.all(
    subscriptions.map(async (sub) => {
      const userId = sub.userId;

      const inactiveSubscrtiptio = await findUserInactiveSubscriptionById(userId);
      const cleanInactiveSubscription =
        inactiveSubscrtiptio &&
          typeof inactiveSubscrtiptio === "object" &&
          !Array.isArray(inactiveSubscrtiptio) &&
          inactiveSubscrtiptio.constructor === Object
          ? inactiveSubscrtiptio
          : null;

      return {
        ...sub,
        inactiveSubscription: cleanInactiveSubscription
      };
    })
  );

  return { subscriptions, meta };
};




const findUserSubscriptionById = async (id) => {
  // Retrieve only the subscription data for the user
  const user = await User.findById(id).select('activeSubscription');
  return user  // Return subscription or null if not found
};
const findUserInactiveSubscriptionById = async (id) => {
  const user = await User.findById(id).select("inActiveSubscription").lean();
  return user?.inActiveSubscription || null;
};

const findUserInactiveSubscriptionByIdcomplete = async (id) => {
  const user = await User.findById(id);
  return user
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
const findById = async (userId) => {
  return await User.findById(userId);
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
  findByIdAndDelete,
  findById,
  findUserInactiveSubscriptionById,
  findUserInactiveSubscriptionByIdcomplete,

};