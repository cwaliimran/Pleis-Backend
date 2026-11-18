// services/venueService.js
const { buildKeywordQueryFromModel, buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { syncOrganizationLocation } = require("../../commonModules/organizations/syncOrganizationLocation");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatOrganization } = require("../organizations/formatter/formatOrganization");
const Organizations = require("@OrganizationModel");
const { formatVenue } = require("./formatter/formatVenue");
const Venues = require("@VenuesModel");
const venueRepo = require("./venuesRepository");
const { cache, invalidate } = require("@redisCache");
const { invalidateDiscoveryCaches } = require("@cacheNamespaces");

const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const mongoose = require("mongoose");
const { ACTIVE_ORGANIZATIONS_CACHE_KEY } = require("../../admin/organizations/organizationService");

const getVenues = async ({
  page,
  limit,
  keyword,
  status,
  pinned,
  sortBy,
  sortOrder,
  userId,
  date,
  organization
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // 🔹 Normalize organization param → array of ObjectIds
  // 🔹 Normalize organization param → array of ObjectIds
  let organizationIds;
  if (Array.isArray(organization)) {
    // Already an array of IDs
    organizationIds = organization
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
  } else if (typeof organization === "string") {
    // If a comma-separated string
    organizationIds = organization
      .split(",")
      .map(id => id.trim())
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
  }

  if (!organizationIds?.length) {
    organizationIds = undefined;
  }


  const pipeline = [
    // 1️⃣ Join with Organizations collection
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organizationData",
        pipeline: [{ $project: { basicInfo: 1, creator: 1, staff: 1 } }]
      }
    },

    // 2️⃣ Flatten organizationData
    {
      $unwind: {
        path: "$organizationData",
        preserveNullAndEmptyArrays: true
      }
    }
  ];

  // 3️⃣ Organization filter OR user access fallback
  if (organizationIds?.length) {
    // 🔹 STRICT organization filter
    pipeline.push({
      $match: {
        organization: { $in: organizationIds }
      }
    });
  } else {
    // 🔹 User-based access
    pipeline.push({
      $match: {
        $or: [
          { creator: new mongoose.Types.ObjectId(userId) },
          { "organizationData.creator": new mongoose.Types.ObjectId(userId) },
          { "organizationData.staff.user": new mongoose.Types.ObjectId(userId) }
        ]
      }
    });
  }

  // 4️⃣ Status filter
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // 5️⃣ Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // 6️⃣ Keyword search
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Venues.schema },
      { schema: Organizations.schema, prefix: "organizationData." }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // 7️⃣ Pinned filter
  if (pinned !== undefined) {
    pipeline.push({
      $match: {
        $or: [
          { pinned: false },
          { pinned: null },
          { pinned: { $exists: false } }
        ]
      }
    });
  }
  if (sortBy === "title") {
    pipeline.push({
      $addFields: { sortField: { $toLower: { $ifNull: ["$title", ""] } } }
    });
  } else if (sortBy === "organizationName") {
    pipeline.push({
      $addFields: {
        sortField: { $toLower: { $ifNull: ["$organizationData.basicInfo.name", ""] } }
      }
    });
  } else if (sortBy === "createdAt") {
    pipeline.push({ $addFields: { sortField: "$createdAt" } });
  }

  pipeline.push({ $sort: { sortField: sortOrder === "asc" ? 1 : -1, _id: -1 } });


  // 9️⃣ Pagination + count
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // 🔟 Execute aggregation
  const result = await Venues.aggregate(pipeline);

  const venues = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  // 1️⃣1️⃣ Meta counts
  const [total, active, inactive] = await Promise.all([
    Venues.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Venues.countDocuments({ creator: userId, status: "active" }),
    Venues.countDocuments({ creator: userId, status: "inactive" })
  ]);

  // 1️⃣2️⃣ Format response
  const formattedVenues = venues.map(venue => {
    const venueDoc = new Venues(venue);
    const formattedVenue = venueDoc.formatResponse();

    if (venue.organizationData) {
      formattedVenue.organization = formatOrganization(venue.organizationData);
    }

    return formattedVenue;
  });

  const meta = generateMeta(page, limit, totalFiltered);
  meta.venuesCount = { total, active, inactive };

  return {
    venues: formattedVenues,
    meta
  };
};


//get venues for menu options dropdown where organization is not assigned yet

const getUnassignedVenues = async (userId) => {
  return await venueRepo.getUnassignedVenues(userId);
};

const updateVenue = async (id, data) => {
  let venue = await venueRepo.findVenueById(id);
  if (!venue) return null;

  const allowedFields = [
    "title",
    "floorPlan",
    "venueType",
    "organization",
    "isPrimary",
    "location",
    "image",
    "status",
    "pinned",
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return venue; // nothing to update
  }

  // Handle organization change and primary logic
  let organizationChanged = false;

  if (updateData.organization && String(updateData.organization) !== String(venue.organization)) {
    organizationChanged = true;
  }

  const previousOrganization = venue.organization;

  // One transaction: the venue, the single primary per organization, and the
  // organization's location (always its primary venue's location).
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Step 1: Update venue fields
      Object.assign(venue, updateData);
      await venue.save({ session });

      // Step 2: One primary per organization
      if (updateData.isPrimary) {
        await Venues.updateMany(
          {
            organization: venue.organization,
            _id: { $ne: venue._id },
            isPrimary: true,
          },
          { $set: { isPrimary: false } },
          { session }
        );
      }

      // Step 3: Organization location = primary venue location. Editing a
      // non-primary venue leaves it as it is. A venue moved away is no longer
      // the previous organization's primary.
      if (venue.organization) {
        await syncOrganizationLocation(venue.organization, { session });
      }
      if (organizationChanged && previousOrganization) {
        await syncOrganizationLocation(previousOrganization, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  // Organization location / venue may have changed: refresh discovery caches.
  await invalidate(ACTIVE_ORGANIZATIONS_CACHE_KEY);
  await invalidateDiscoveryCaches();

  //get updated venue with venueDetails
  venue = await getVenueDetails(venue._id);
  return venue;
};



const deleteVenue = async (id) => {
  const updated = await venueRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getVenueDetails = async (id, select = []) => {
  // Aggregate to join organization data
  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organizationData",
        pipeline: [
          { $project: { basicInfo: 1 } }
        ]
      }
    },
    { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } }
  ];

  // Optionally project selected fields
  if (select.length > 0) {
    const projection = {};
    select.forEach(field => projection[field] = 1);
    projection.organizationData = 1;
    pipeline.push({ $project: projection });
  }

  const result = await Venues.aggregate(pipeline);
  let venue = result[0];
  if (!venue) return null;
  // Format venue response

  venue = formatVenue(venue);

  if (venue.organizationData) {
    venue.organization = formatOrganization(venue.organizationData);
  }

  return venue;
};

module.exports = {
  createVenue,
  getVenues,
  updateVenue,
  getVenueDetails,
  deleteVenue,
  getUnassignedVenues
};
