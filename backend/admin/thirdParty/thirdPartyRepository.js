// repositories/ThirdpartyRepository.js
const Thirdpartys = require("@ThirdPartyModel");

const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
// const { ThirdpartysFormatter, ThirdpartysFormatterAdjustDates } = require("../../app/Thirdpartys/formaters/ThirdpartyFormetter");
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
} = require("../../helperUtils/responseUtil");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const getCreatorFromOrganization = async (organizationId) => {
  try {
    const result = await Organizations.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(organizationId) },  // Match the organization by its ID
      },
      {
        $lookup: {
          from: "users",  // Assuming the 'creator' is in the 'users' collection
          localField: "creator",  // Field in the 'organizations' collection that references the creator
          foreignField: "_id",  // Field in the 'users' collection to match with
          as: "creatorDetails",  // Alias for the resulting array of creator data
        },
      },
      {
        $unwind: { path: "$creatorDetails", preserveNullAndEmptyArrays: true },  // Unwind creator details array (if it exists)
      },
      {
        $project: {
          creatorId: "$creatorDetails._id",  // Extract just the _id of the creator
          _id: 0,  // Exclude the organization _id from the result
        },
      },
    ]);

    if (result.length > 0) {
      return result[0].creatorId;  // Return the creator ID
    } else {
      return null;  // Return null if no matching organization is found
    }
  } catch (err) {
    console.error("Error in aggregation:", err);
    throw err;
  }
};
const createThirdparty = async (data) => {
  try {
    const Thirdparty = new Thirdpartys(data);
    await Thirdparty.save();
    return Thirdparty;
  } catch (err) {
    throw err;
  }
};

// Get all Thirdpartys with their assigned organization populated, sorted by createdAt descending
const getThirdpartysWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Thirdpartys.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countThirdpartys = async (query = {}) => {
  return Thirdpartys.countDocuments(query);
};

// Find by ID
const findThirdpartyById = async (id) => {
  return Thirdpartys.findById(id);
};

// Update and save
const updateThirdpartyData = async (Thirdparty, data) => {
  Object.assign(Thirdparty, data);
  return await Thirdparty.save();
};

// Delete
const deleteThirdpartyById = async (Thirdparty) => {
  return await Thirdparty.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Thirdpartys.findByIdAndUpdate(id, data, { new: true });
};




const getThirdpartys = async ({ timezone, page, limit, keyword, status, createrId, date, skip }) => {
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [
    {
      $match: {
        ...(createrId && { createID: new mongoose.Types.ObjectId(createrId) })
      }
    }
  ];

  // Status filter
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // Date filter (createdAt)
  if (date) {
    let { start, end } = getStartAndEndOfDay(date, timezone);

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // Keyword search
if (keyword) {
  const filterQuery = {};

  // Convert keyword to lowercase for case-insensitive matching (string fields)
  const keywordLower = keyword.toLowerCase();

  // Search across different fields using regex for strings
  filterQuery.$or = [
    { title: { $regex: keywordLower, $options: 'i' } },
    { description: { $regex: keywordLower, $options: 'i' } },
    { rewardSourceLink: { $regex: keywordLower, $options: 'i' } },
    { publicKeyForPartner: { $regex: keywordLower, $options: 'i' } },
    { statusLevel: { $regex: keywordLower, $options: 'i' } },
    { status: { $regex: keywordLower, $options: 'i' } },
    { createID: { $regex: keywordLower, $options: 'i' } }
  ];

  // Match pointCost if the keyword is a number (for exact numeric matching)
  const numericKeyword = parseFloat(keyword);
  if (!isNaN(numericKeyword)) {
    filterQuery.$or.push(
      { pointCost: numericKeyword },  // Match pointCost if keyword is a number
      { claimLimit: numericKeyword }  // Match claimLimit if keyword is a number
    );
  }

  // Optionally, match _id or other fields (for strict matches) if keyword is valid ObjectId
  if (ObjectId.isValid(keyword)) {
    filterQuery._id = new ObjectId(keyword);  // Match _id if keyword is a valid ObjectId
  }

  // If filters were added, push them into the pipeline
  if (Object.keys(filterQuery).length) {
    pipeline.push({ $match: filterQuery });
  }
}


  // Lookup to join the StatusLevels collection and get the title field
  pipeline.push({
    $lookup: {
      from: 'globalstatuslevels', // Collection to join
      localField: 'statusLevel', // Field from the current collection
      foreignField: '_id', // Field from the StatusLevels collection
      as: 'statusLevelDetails' // Alias for the joined documents
    }
  });

  // Project the required fields, including the title from StatusLevels
pipeline.push({
  $project: {
    _id: 1,  // Include _id
    title: 1,  // Include title
    image: 1,  // Include image
    description: 1,  // Include description
    pointCost: 1,  // Include pointCost
    claimLimit: 1,  // Include claimLimit
    rewardSourceLink: 1,  // Include rewardSourceLink
    publicKeyForPartner: 1,  // Include publicKeyForPartner
    status: 1,  // Include status
    createID: 1,  // Include createID
    createdAt: 1,  // Include createdAt
    updatedAt: 1,  // Include updatedAt
    __v: 1,  // Include __v

    // Create a statusLevel object with id and title
    statusLevel: {
      _id: { $arrayElemAt: ["$statusLevelDetails._id", 0] },  // Get the _id from StatusLevels
      title: { $arrayElemAt: ["$statusLevelDetails.title", 0] }  // Get the title from StatusLevels
    }
  }
});


  // Sort by newest
  pipeline.push({ $sort: { createdAt: -1 } });

  // Pagination facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await Thirdpartys.aggregate(pipeline);

  // Handle the results
  let thirdpartyList = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Collect counts
  const [total, active, inactive] = await Promise.all([
    Thirdpartys.countDocuments({
      ...(createrId && { companyOrganizer: createrId }),
      status: { $ne: "deleted" }
    }),
    Thirdpartys.countDocuments({
      status: "active",
      ...(createrId && { companyOrganizer: createrId })
    }),
    Thirdpartys.countDocuments({
      status: "inactive",
      ...(createrId && { companyOrganizer: createrId })
    })
  ]);

  // Meta
  const meta = generateMeta(page, limit, totalFiltered);
  meta.ThirdpartysCount = { total, active, inactive };

  return { Thirdpartys: thirdpartyList, meta };
};



const getUserThirdpartys = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, ThirdpartyStatus, ThirdpartyId }) => {
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
        ...(ThirdpartyStatus && { ThirdpartyStatus: ThirdpartyStatus }),
        ...(ThirdpartyId && { ThirdpartyId: new mongoose.Types.ObjectId(ThirdpartyId) })
      }
    },
    {
  $lookup: {
    from: "userThirdpartys",
    localField: "_id",          // Thirdparty _id
    foreignField: "_id",        // Thirdparty _id
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
        ThirdpartyType: 1,
        organizationId: 1,
        ThirdpartyStatus: 1,
        companyOrganizer: 1,
        ThirdpartyId: 1,
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
        { schema: UserThirdpartys.schema }
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

  const result = await UserThirdpartys.aggregate(pipeline);
console.log("pipeline",result );
  let Thirdpartys = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    UserThirdpartys.countDocuments({ ...(userId && { userId: userId }), ThirdpartyStatus: { $ne: "cancelled" } }),
    UserThirdpartys.countDocuments({ ThirdpartyStatus: "active", ...(userId && { userId: userId }) }),
    UserThirdpartys.countDocuments({ ThirdpartyStatus: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.ThirdpartysCount = { total, active, inactive };


  Thirdpartys = Thirdpartys.map(item => {
    const formatted = ThirdpartysFormatterAdjustDates(item);
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
  return { Thirdpartys, meta }
}



const findUserThirdpartyById = async (id) => {
  return UserThirdpartys.findById(id);
};


const findUserById = async (id) => {
  return User.findById(id);
};

module.exports = {
  createThirdparty,
  getThirdpartysWithFilters,
  countThirdpartys,
  findThirdpartyById,
  updateThirdpartyData,
  deleteThirdpartyById,
  findByIdAndUpdate,
  getThirdpartys,
  getUserThirdpartys,
  findUserThirdpartyById,
  findUserById,
};