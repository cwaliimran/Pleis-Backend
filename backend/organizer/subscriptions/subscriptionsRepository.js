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

const findUserInactiveSubscriptionById = async (id) => {
  const user = await User.findById(id).select("inActiveSubscription").lean();
  return user?.inActiveSubscription || null;
};
const getUserSubscriptions = async ({
  timezone,
  page = 1,
  limit = 10,
  keyword,
  status,
  date,
  range,
  userId,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = getCurrentDateInTimezone({ timezone });

  /* ================================
     BASE MATCH (SINGLE USER)
  ================================= */
  const pipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
        activeSubscription: { $exists: true },
      },
    },

    /* ================================
       FLATTEN SUBSCRIPTION
    ================================= */
    {
      $addFields: {
        subscriptionTypes: "$activeSubscription.subscriptionTypes",
        pricingPlan: "$activeSubscription.pricingPlan",
        numberOfOrganizations: "$activeSubscription.numberOfOrganizations",
        totalSubscriptionAmount: "$activeSubscription.totalSubscriptionAmount",
        startDate: "$activeSubscription.startDate",
        basePrice: "$activeSubscription.basePrice",
        
        endDate: "$activeSubscription.endDate",
        subscriptionStatus: {
          $cond: [
            {
              $and: [
                { $ne: ["$activeSubscription.endDate", null] },
                { $lte: ["$activeSubscription.endDate", now] },
              ],
            },
            "expired",
            "$activeSubscription.status",
          ],
        },
      },
    },
  ];

  /* ================================
     RANGE FILTERS (startDate)
  ================================= */
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

  /* ================================
     STATUS FILTER
  ================================= */
  if (status) {
    pipeline.push({
      $match: { subscriptionStatus: status },
    });
  } else {
    pipeline.push({
      $match: { subscriptionStatus: { $ne: "deleted" } },
    });
  }

  /* ================================
     DATE FILTER
  ================================= */
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    pipeline.push({
      $match: { startDate: { $gte: start, $lt: end } },
    });
  }

  /* ================================
     KEYWORD FILTER
  ================================= */
  if (keyword) {
    pipeline.push({
      $match: {
        $or: [
          { firstName: new RegExp(keyword, "i") },
          { lastName: new RegExp(keyword, "i") },
          { email: new RegExp(keyword, "i") },
        ],
      },
    });
  }

  /* ================================
     SORT + PAGINATION
  ================================= */
  pipeline.push({ $sort: { startDate: -1 } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  /* ================================
     EXECUTE
  ================================= */
  const result = await User.aggregate(pipeline);

const users = result[0]?.data || [];
const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

// attach inactive subscription
const inactiveSubscription =
  users.length > 0
    ? await findUserInactiveSubscriptionById(users[0]._id)
    : null;


  /* ================================
     FORMAT RESPONSE
  ================================= */
  const subscriptions = users.map((user) => {
    const amount = Number(user.totalSubscriptionAmount || 0);
    const monthlyPrice =
      user.pricingPlan === "yearly"
        ? Number((amount / 12).toFixed(2))
        : amount;

    return {
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      inactiveSubscription,

      subscription: {
        subscriptionTypes: user.subscriptionTypes,
        pricingPlan: user.pricingPlan,
        numberOfOrganizations: user.numberOfOrganizations,
        totalSubscriptionAmount: amount,
        monthlyPrice,
        startDate: user.startDate,
        endDate: user.endDate,
        basePrice: user.basePrice,
        status: user.activeSubscriptionStatus,
        orderingCommission: user.activeSubscription?.orderingCommission || 0,
        ticketingCommission: user.activeSubscription?.ticketingCommission || 0,
        reservationCommission: user.activeSubscription?.reservationCommission || 0,
      },
    };
  });

  const meta = generateMeta(page, limit, totalFiltered);

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
    return  await User.findById(userId).select('activeSubscription');
};
const getSubscriptionSettings = async () => {
  return await SubscriptionSettings.findOne();
}


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
  getSubscriptionSettings
};