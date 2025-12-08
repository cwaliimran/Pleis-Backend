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


const getUserSubscriptions = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, SubscriptionStatus, SubscriptionId }) => {
  const now = getCurrentDateInTimezone({ timezone });

  let organizationsIds = Array.isArray(organizationsId)
    ? organizationsId
    : JSON.parse(organizationsId || '[]');
  organizationsIds = organizationsIds.map(id => new mongoose.Types.ObjectId(id));

  const pipeline = [
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
        ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }),
        ...(SubscriptionStatus && { SubscriptionStatus: SubscriptionStatus }),
        ...(SubscriptionId && { SubscriptionId: new mongoose.Types.ObjectId(SubscriptionId) })
      }
    },
    {
  $lookup: {
    from: "userSubscriptions",
    localField: "_id",          // Subscription _id
    foreignField: "_id",        // Subscription _id
    pipeline: [
      {
        $project: {
          firstName: 1,
          lastName: 1,
          phoneNumber: 1
        }
      }
    ],
    as: "user"
  }
},
    {
      $addFields: {
        user: { $arrayElemAt: ["$user", 0] }
      }
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        validEventId: {
          $cond: {
            if: { $and: [{ $ne: ["$optionalEventId", ""] }, { $ne: ["$optionalEventId", null] }] },
            then: { $toObjectId: "$optionalEventId" },
            else: null
          }
        }
      }
    },
    {
      $lookup: {
        from: "events",
        localField: "validEventId",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        userId: 1,
        user: 1,
        partySize: 1,
        SubscriptionType: 1,
        organizationId: 1,
        SubscriptionStatus: 1,
        companyOrganizer: 1,
        SubscriptionId: 1,
        timingSlots: 1,
        status: 1,
        optionalEventId: 1,
        createdAt: 1,
        updatedAt: 1,
        notes: 1,
        member: "Gold",
        eventTitle: { $ifNull: ["$event.basicInfo.title", "No Event Title"] }
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
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: UserSubscriptions.schema }
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

  const result = await UserSubscriptions.aggregate(pipeline);
console.log("pipeline",result );
  let Subscriptions = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    UserSubscriptions.countDocuments({ ...(userId && { userId: userId }), SubscriptionStatus: { $ne: "cancelled" } }),
    UserSubscriptions.countDocuments({ SubscriptionStatus: "active", ...(userId && { userId: userId }) }),
    UserSubscriptions.countDocuments({ SubscriptionStatus: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.SubscriptionsCount = { total, active, inactive };


  Subscriptions = Subscriptions.map(item => {
    const formatted = SubscriptionsFormatterAdjustDates(item);
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



const findUserSubscriptionById = async (id) => {
  return UserSubscriptions.findById(id);
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

const findByIdAndDelete = async (id) => {
  try {
    const deleted = await SubscriptionSettings.findByIdAndDelete(id);
    return deleted;   // returns the deleted document OR null
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