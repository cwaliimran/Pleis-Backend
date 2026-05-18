// repositories/organizationRepository.js
const Venues = require("@VenuesModel");

const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { getPromotionsByCreator } = require("../loyalty/promotions/promotionsRepository");
const { getNotificationByOrganizationId } = require("../notifications/notificationsRepository");
const { getTotalTicketsPurchasedByOrganizationId } = require("../ticketing/ticketingsRepository");
const { getTotalEngagementEventsByOrganizationId } = require("@appEngagement/engagementEventsRepository");
const { getTotalClosingBalanceByOrganizationId } = require("../transactions/repositories/unifiedTransactionsRepository");
const { default: mongoose } = require("mongoose");
const { User } = require("@UsersModel");
const { countClubMembersOfOrganization } = require("../loyalty/clubMembers/clubMembersRepository");
const { getActiveSubscription } = require("../usersManagement/usersRepository");
const { getFullImageUrl } = require("@utils/imageHelper");

// Create
const createOrganization = async (data) => {
  const NoOrganizationCount = await Organizations.countDocuments({
    creator: new mongoose.Types.ObjectId(data.creator),
    status: "active"
  });
  const UsersOrganizationsLimit = await getActiveSubscription(data.creator)
  if (NoOrganizationCount >= UsersOrganizationsLimit) {
    throw new Error("you_have_reached_the_maximum_number_of_organizations_allowed_for_your_subscription_plan_please_upgrade_your_subscription_to_create_more_organizations");
  }
  const organization = new Organizations(data);
  return await organization.save();
};

// Get all with filters
const getOrganizationsWithFilters = async (query, skip, limit, sortBy, sortOrder) => {
  const matchQuery = { ...query };

  // Set the match query for companyOrganizer if provided
  if (query.companyOrganizer) {
    matchQuery.creator = new mongoose.Types.ObjectId(query.companyOrganizer);
  }

  // Aggregation pipeline
  const pipeline = [
    {
      $match: matchQuery  // Match the query to filter organizations
    },
    {
      $lookup: {
        from: "users",  // Join with the Users collection
        localField: "creator",  // Match creator in Organizations with _id in Users
        foreignField: "_id",  // Match the _id in Users collection
        as: "user", // The result will be stored in a field named "user"
        pipeline: [
          {
            $project: {
              activeSubscription: 1, // Include activeSubscription field
              inActiveSubscription: 1 // Include inActiveSubscription field
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$user",  // Unwind the "user" array so that we can access user fields directly
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching users
      }
    },
    {
      $lookup: {
        from: "users",  // Join with the Users collection
        localField: "creator",  // Match creator in Organizations with _id in Users
        foreignField: "_id",  // Match the _id in Users collection
        as: "creator", // The result will be stored in a field named "creator"
        pipeline: [
          {
            $project: {
              firstName: 1,
              lastName: 1,

            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$creator",  // Unwind the "user" array so that we can access user fields directly
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching users
      }
    },
    {
      $lookup: {
        from: "engagementevents",  // Join with the EngagementEvents collection
        localField: "_id",  // Match _id in Organizations with organization._id
        foreignField: "entityId",  // Match the entityId in EngagementEvents
        as: "viewCount",  // The result will be stored in a field named "viewCount"
        pipeline: [
          {
            $match: {
              entityType: "organizations",  // Only include engagement events of type "organizations"
              action: "view"  // Only include "view" actions
            }
          },
          {
            $group: {
              _id: "$entityId",  // Group by organization entityId
              viewCount: { $sum: 1 }  // Count the number of views for each organization
            }
          }
        ]
      }
    },
    {
      $addFields: {
        viewCount: {
          $ifNull: [
            { $arrayElemAt: ["$viewCount.viewCount", 0] },
            0
          ]
        }
      }
    },
    {
      $lookup: {
        from: "webhookevents",  // Join with the WebhookEvents collection
        localField: "_id",  // Match _id in Organizations with organization._id
        foreignField: "organization",  // Match the organization field in WebhookEvents
        as: "revenueData",  // The result will be stored in a field named "revenueData"
        pipeline: [
          {
            $match: {
              organization: { $exists: true },  // Ensure that the organization field exists in WebhookEvents
            }
          },
          {
            $group: {
              _id: "$organization",  // Group by organization entityId
              totalRevenue: { $sum: { $toDouble: "$amount" } }  // Sum the revenue (amount) for each organization
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$revenueData",  // Unwind the "revenueData" array to access revenue per organization
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching events
      }
    },
    {
      $addFields: {
        revenue: {
          $ifNull: [
            "$revenueData.totalRevenue",  // Get the totalRevenue from revenueData
            0  // If no revenue data, default to 0
          ]
        }
      }
    },
    {
      $project: {
        revenueData: 0  // Remove the 'revenueData' field from the final output
      }
    },

  ];
  if (sortBy && sortOrder) {
    if (sortBy === "organizationName") {
      pipeline.push({
        $addFields: {
          organizationNameSort: {
            $toLower: { $ifNull: ["$basicInfo.name", ""] }
          }
        }
      });
      pipeline.push({
        $sort: { organizationNameSort: sortOrder === "asc" ? 1 : -1 }
      });
    }
    else if (sortBy === "organizerName") {
      pipeline.push({
        $addFields: {
          organizerNameSort: {
            $toLower: { $ifNull: ["$creator.firstName", ""] }
          }
        }
      });
      pipeline.push({
        $sort: { organizerNameSort: sortOrder === "asc" ? 1 : -1 }
      });
    } else {
      pipeline.push({
        $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 }
      });
    }
  }
  if (skip !== undefined && limit !== undefined) {
    pipeline.push(
      { $skip: skip },
      { $limit: limit }
    );
  }



  // Perform the aggregation query
  const results = await Organizations.aggregate(pipeline);

  return results;
};
// Count by condition
const countOrganizations = async (query = {}) => {
  return Organizations.countDocuments(query);
};


const getOrganizationCounts = async (query) => {
  return getModelCounts({ model: Organizations, filterQuery: query });
}

// Find by ID
const findOrganizationById = async (id) => {
  return Organizations.findById(id);
};


const getOrganizationDetails = async (id) => {
  // Fetch organization, primary venue, and other related data concurrently

  const {
    getTotalEventCountByOrganizationId
  } = require("../events/eventRepository");
  const companyOrganizer = await getOrgCompanyOrganizer(id);
  console.log("companyOrganizer", companyOrganizer);

  const [organization, primaryVenue, events, ticketsSold, views, revenue, clubMembersCount] = await Promise.all([
    Organizations.findById(id)
      .populate({ path: "otherInfo.tags", options: { sort: { title: 1 } } })
      .populate({ path: "otherInfo.categories", options: { sort: { title: 1 } } })
      .populate({
        path: "creator",
        select: "firstName lastName email companyDetails",
        populate: {
          path: "companyDetails.suppliers",
          select: "title",
        },
      }),
    Venues.findOne({ organization: id, isPrimary: true }).populate("venueType"),
    getTotalEventCountByOrganizationId(id),
    getTotalTicketsPurchasedByOrganizationId(id),
    getTotalEngagementEventsByOrganizationId(id),
    getTotalClosingBalanceByOrganizationId(id),
    countClubMembersOfOrganization(companyOrganizer)
  ]);

  // Convert the organization to a plain object if it's a Mongoose document
  const orgObj = organization.toObject ? organization.toObject() : organization;

  // Attach related data to the organization object
  orgObj.venue = primaryVenue ? primaryVenue.formatResponse() : null;
  orgObj.events = events; // Attach total events count
  orgObj.ticketsSold = ticketsSold; // Attach total tickets sold
  orgObj.views = views; // Attach total views
  orgObj.revenue = revenue; // Attach total revenue
  orgObj.followers = clubMembersCount; // Attach total club members count

  return orgObj;
};





// Delete
const deleteOrganizationById = async (organization) => {

  return await organization.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {

  return Organizations.findByIdAndUpdate(id, { $set: data }, { new: true });
};

const getOrganizationsAsStaff = async (userId) => {
  const organizations = await Organizations.find({
    status: "active",

    $or: [
      { creator: userId },

      {
        staff: {
          $elemMatch: {
            user: userId,
            status: "active",
          },
        },
      },
    ],
  })
    .lean()
    .populate("otherInfo.tags")
    .populate("otherInfo.categories")
    .populate({
      path: "creator",
      select: "firstName lastName email companyDetails",
      populate: {
        path: "companyDetails.suppliers",
        select: "title",
      },
    });



  // For each organization, filter staff to only include the current user
  return organizations.map(org => {
    if (org.creator?.toString() === userId.toString()) {
      // If creator, return all staff
      return org;
    }
    // Otherwise, filter staff to only the current user
    return {
      ...org,
      staff: org.staff.filter(s => s.user.toString() === userId.toString())
    };
  });
};

const getStaffIdsByOrganization = async (organizationId) => {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new Error("Invalid organization ID");
  }

  const organization = await Organizations.findById(
    organizationId,
    { staff: 1 }
  ).lean();

  if (!organization || !organization.staff) {
    return [];
  }

  // Extract staff user IDs
  const staffIds = organization.staff
    .map(item => item.user)
    .filter(Boolean)
    .map(id => id.toString());

  return staffIds;
};


//get organization ids by company organizer
const getOrganizationIdsByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer }).select("_id").lean();
  return organizations.map(org => org._id);
};

//get organization names by company organizer
const getOrganizationNamesByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer, status: "active" }).select("basicInfo.name").lean();
  return organizations;
};
const getOrganizationByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer, status: "active" }).select("basicInfo.name basicInfo.media.logo location").lean();
  const formattedOrganizations = organizations.map(org => {
    if (org.basicInfo?.media?.logo) {
      const logoName = org.basicInfo.media.logo;
      org.basicInfo.media.logo = getFullImageUrl(logoName);
    }
    return org;
  });
  return formattedOrganizations;
};

//getMenuIdsByCompanyOrganizer
const getMenuIdsByCompanyOrganizer = async (companyOrganizer) => {
  const organizationIds = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  const menus = await Menus.find({ organization: { $in: organizationIds }, status: "active" }).select("_id").lean();
  console.log("menus", menus);
  return menus.map(menu => menu._id);
};
const getMenuIdsByOrganization = async (organization) => {
  // Split the organization input by commas or % and convert to ObjectId
  const organizationIds = organization
    .split(/[,%]/) // supports both "," and "%"
    .filter(Boolean) // Remove any empty strings
    .map(id => new mongoose.Types.ObjectId(id)); // Convert strings to ObjectIds

  // Query Menus where organization is in the list of organizationIds
  const menus = await Menus.find({ organization: { $in: organizationIds }, status: "active" }).select("_id").lean();

  // Return the menu IDs
  return menus.map(menu => menu._id);
};

const getOrgCompanyOrganizer = async (organizationId, session = null) => {
  const query = Organizations
    .findById(organizationId)
    .select("creator");

  if (session) {
    query.session(session);
  }

  const org = await query.lean();

  return org ? org.creator : null;
};
const getOrganizationNotifications = async (id) => {
  const notifications = await getNotificationByOrganizationId(id);
  return notifications;
};
const getOrganizationIdByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer }).select("_id").lean();
  return organizations;
};

//get company pickup options
const getInAppOrderingSettings = async (companyOrganizer) => {
  const orgSettings = await Organizations.findOne({
    creator: companyOrganizer
  })
    .select("inAppOrderingSettings")
    .lean();
  return orgSettings?.inAppOrderingSettings || [];
};

const getLogoByOrganization = async (organizationId) => {
  const orgSettings = await Organizations.findOne({ _id: organizationId })
    .select("basicInfo.media.logo")
    .lean();

  // Return the logo URL
  return orgSettings.basicInfo.media.logo;
};

const getOrganizationsByTag = async ({
  tagId,
  userLocation,
  radiusKm,
  page = 1,
  limit = 10
}) => {
  const skip = (page - 1) * limit;

  const tagObjectId = new mongoose.Types.ObjectId(tagId);

  const geoQuery = {
    status: "active",
    "otherInfo.tags": { $in: [tagObjectId] }
  };

  const pipeline = [];

  /* ===============================
     1️⃣ GEO / NON-GEO BASE QUERY
     =============================== */
  if (userLocation) {
    pipeline.push(
      {
        $geoNear: {
          near: userLocation,
          key: "location",
          distanceField: "distance",
          spherical: true,
          query: geoQuery,
          ...(radiusKm && { maxDistance: radiusKm * 1000 })
        }
      },
      { $sort: { distance: 1 } }
    );
  } else {
    pipeline.push(
      { $match: geoQuery },
      { $sort: { createdAt: -1 } }
    );
  }

  /* ===============================
     2️⃣ PAGINATION
     =============================== */
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  /* ===============================
     3️⃣ TAGS POPULATION (kept for consistency)
     =============================== */
  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     4️⃣ PRIMARY VENUE + VENUE TYPES
     =============================== */
  pipeline.push({
    $lookup: {
      from: "venues",
      let: { orgId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$organization", "$$orgId"] },
            isPrimary: true,
            status: "active"
          }
        },
        {
          $project: {
            _id: 0,
            venueType: 1
          }
        }
      ],
      as: "primaryVenue"
    }
  });

  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     5️⃣ FINAL SHAPE (UNIFIED OUTPUT)
     =============================== */
  pipeline.push({
    $project: {
      _id: 1,

      "basicInfo.name": 1,
      "basicInfo.media": 1,

      operatingHours: 1,
      distance: userLocation ? 1 : null,

      tags: 1,

      venue: {
        venueType: "$venueTypes"
      }
    }
  });

  const organizations = await Organizations.aggregate(pipeline);

  return { organizations };
};

const getOrganizationsByVenueType = async ({
  venueTypeId,
  userLocation,
  radiusKm,
  page = 1,
  limit = 10
}) => {
  const skip = (page - 1) * limit;

  const venueTypeObjectId = new mongoose.Types.ObjectId(venueTypeId);

  /* ===============================
     1️⃣ GET ORGANIZATION IDS FROM VENUES
     =============================== */
  const venueMatch = {
    status: "active",
    venueType: { $in: [venueTypeObjectId] }
  };

  const venuePipeline = [
    { $match: venueMatch },
    {
      $group: {
        _id: "$organization"
      }
    }
  ];

  const venueAgg = await Venues.aggregate(venuePipeline);

  const organizationIds = venueAgg
    .map(v => v._id)
    .filter(Boolean);

  if (organizationIds.length === 0) {
    return { organizations: [] };
  }

  /* ===============================
     2️⃣ ORGANIZATION PIPELINE (MATCH YOUR NEARBY STYLE)
     =============================== */

  const geoQuery = {
    status: "active",
    _id: { $in: organizationIds }
  };

  const pipeline = [];

  /* optional geo sorting */
  if (userLocation) {
    pipeline.push(
      {
        $geoNear: {
          near: userLocation,
          key: "location",
          distanceField: "distance",
          spherical: true,
          query: geoQuery,
          ...(radiusKm && { maxDistance: radiusKm * 1000 })
        }
      },
      { $sort: { distance: 1 } }
    );
  } else {
    pipeline.push(
      { $match: geoQuery },
      { $sort: { createdAt: -1 } }
    );
  }

  /* ===============================
     3️⃣ PAGINATION
     =============================== */
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  /* ===============================
     4️⃣ TAGS POPULATION (same as nearby)
     =============================== */
  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     5️⃣ VENUE TYPE POPULATION (same pattern)
     =============================== */
  pipeline.push({
    $lookup: {
      from: "venues",
      let: { orgId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$organization", "$$orgId"] },
            isPrimary: true,
            status: "active"
          }
        },
        {
          $project: {
            _id: 0,
            venueType: 1
          }
        }
      ],
      as: "primaryVenue"
    }
  });

  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     6️⃣ FINAL SHAPE (MATCH NEARBY OUTPUT STYLE)
     =============================== */
  pipeline.push({
    $project: {
      _id: 1,

      "basicInfo.name": 1,
      "basicInfo.media": 1,

      operatingHours: 1,
      distance: userLocation ? 1 : null,

      tags: 1,

      venue: {
        venueType: "$venueTypes"
      }
    }
  });

  const organizations = await Organizations.aggregate(pipeline);

  return { organizations };
};

const getOrganizationByCategory = async ({
  categoryId,
  userLocation,
  radiusKm,
  page = 1,
  limit = 10
}) => {
  const skip = (page - 1) * limit;

  const categoryObjectId = new mongoose.Types.ObjectId(categoryId);

  const geoQuery = {
    status: "active",
    "otherInfo.categories": { $in: [categoryObjectId] }
  };

  const pipeline = [];

  /* ===============================
     1️⃣ GEO / NON-GEO BASE QUERY
     =============================== */
  if (userLocation) {
    pipeline.push(
      {
        $geoNear: {
          near: userLocation,
          key: "location",
          distanceField: "distance",
          spherical: true,
          query: geoQuery,
          ...(radiusKm && { maxDistance: radiusKm * 1000 })
        }
      },
      { $sort: { distance: 1 } }
    );
  } else {
    pipeline.push(
      { $match: geoQuery },
      { $sort: { createdAt: -1 } }
    );
  }

  /* ===============================
     2️⃣ PAGINATION
     =============================== */
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  /* ===============================
     3️⃣ TAGS (same as other pipelines)
     =============================== */
  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     4️⃣ PRIMARY VENUE + VENUE TYPES
     =============================== */
  pipeline.push({
    $lookup: {
      from: "venues",
      let: { orgId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$organization", "$$orgId"] },
            isPrimary: true,
            status: "active"
          }
        },
        {
          $project: {
            _id: 0,
            venueType: 1
          }
        }
      ],
      as: "primaryVenue"
    }
  });

  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [{ $project: { _id: 1, title: 1 } }]
    }
  });

  /* ===============================
     5️⃣ FINAL SHAPE (MATCH ALL OTHER ORG APIs)
     =============================== */
  pipeline.push({
    $project: {
      _id: 1,

      "basicInfo.name": 1,
      "basicInfo.media": 1,

      operatingHours: 1,
      distance: userLocation ? 1 : null,

      tags: 1,

      venue: {
        venueType: "$venueTypes"
      }
    }
  });

  const organizations = await Organizations.aggregate(pipeline);

  return { organizations };
};

const getOrganizationsBatchRepo = async ({
  tagIds = [],
  categoryIds = [],
  venueTypeIds = [],
  userLocation,
  radiusKm,
  limit = 50,
}) => {
  const tagObjectIds = tagIds.map(id => new mongoose.Types.ObjectId(id));
  const categoryObjectIds = categoryIds.map(id => new mongoose.Types.ObjectId(id));
  const venueTypeObjectIds = venueTypeIds.map(id => new mongoose.Types.ObjectId(id));

  /* =====================================
     1️⃣ BUILD BASE FILTER ($or)
  ===================================== */
  const orFilters = [];

  if (tagObjectIds.length) {
    orFilters.push({ "otherInfo.tags": { $in: tagObjectIds } });
  }

  if (categoryObjectIds.length) {
    orFilters.push({ "otherInfo.categories": { $in: categoryObjectIds } });
  }

  /* =====================================
     2️⃣ VENUE → ORG MAPPING (ONLY IF NEEDED)
  ===================================== */
  let venueOrgMap = new Map(); // orgId -> [venueTypeIds]

  if (venueTypeObjectIds.length) {
    const venueAgg = await Venues.aggregate([
      {
        $match: {
          status: "active",
          venueType: { $in: venueTypeObjectIds },
        },
      },
      {
        $group: {
          _id: "$organization",
          venueTypes: { $addToSet: "$venueType" },
        },
      },
    ]);

    for (const v of venueAgg) {
      venueOrgMap.set(
        v._id.toString(),
        v.venueTypes.map(x => x.toString())
      );
    }

    const orgIdsFromVenue = [...venueOrgMap.keys()].map(
      id => new mongoose.Types.ObjectId(id)
    );

    if (orgIdsFromVenue.length) {
      orFilters.push({ _id: { $in: orgIdsFromVenue } });
    }
  }

  if (!orFilters.length) {
    return { organizations: [] };
  }

  const baseQuery = {
    status: "active",
    $or: orFilters,
  };

  /* =====================================
     3️⃣ MAIN PIPELINE (ONLY ONCE)
  ===================================== */
  const pipeline = [];

  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        query: baseQuery,
        ...(radiusKm && { maxDistance: radiusKm * 1000 }),
      },
    });
  } else {
    pipeline.push({ $match: baseQuery });
  }

  pipeline.push({ $limit: limit });

  /* =====================================
     4️⃣ LOOKUPS (UNCHANGED STRUCTURE)
  ===================================== */
  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [{ $project: { _id: 1, title: 1 } }],
    },
  });

  pipeline.push({
    $lookup: {
      from: "venues",
      let: { orgId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$organization", "$$orgId"] },
            isPrimary: true,
            status: "active",
          },
        },
        {
          $project: {
            _id: 0,
            venueType: 1,
          },
        },
      ],
      as: "primaryVenue",
    },
  });

  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [{ $project: { _id: 1, title: 1 } }],
    },
  });

  /* =====================================
     5️⃣ FINAL SHAPE
  ===================================== */
  pipeline.push({
    $project: {
      _id: 1,
      "basicInfo.name": 1,
      "basicInfo.media": 1,
      operatingHours: 1,
      distance: userLocation ? 1 : null,
      tags: 1,
      "otherInfo.tags": 1,
      "otherInfo.categories": 1,
      venue: {
        venueType: "$venueTypes",
      },
    },
  });

  const organizations = await Organizations.aggregate(pipeline);

  /* =====================================
     6️⃣ ATTACH VENUE TYPES (FROM PRE-AGG)
  ===================================== */
  if (venueOrgMap.size) {
    for (const org of organizations) {
      const vt = venueOrgMap.get(org._id.toString());
      if (vt) {
        org._matchedVenueTypes = vt; // used for mapping later
      }
    }
  }

  return { organizations };
};

module.exports = {
  createOrganization,
  getOrganizationsWithFilters,
  countOrganizations,
  getOrganizationCounts,
  findOrganizationById,
  deleteOrganizationById,
  findByIdAndUpdate,
  getOrganizationDetails,
  getOrganizationsAsStaff,
  getOrganizationIdsByCompanyOrganizer,
  getMenuIdsByCompanyOrganizer,
  getOrganizationNamesByCompanyOrganizer,
  getStaffIdsByOrganization,
  getOrgCompanyOrganizer,
  getOrganizationNotifications,
  getOrganizationIdByCompanyOrganizer,
  getInAppOrderingSettings,
  getMenuIdsByOrganization,
  getLogoByOrganization,
  getOrganizationByCompanyOrganizer,
  getOrganizationsByTag,
  getOrganizationsByVenueType,
  getOrganizationByCategory,
  getOrganizationsBatchRepo
};
