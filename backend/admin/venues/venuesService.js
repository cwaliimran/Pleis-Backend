// services/venueService.js
const { buildKeywordQueryFromModel, buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatOrganization } = require("../organizations/formatter/formatOrganization");
const Organizations = require("@OrganizationModel");
const { formatVenue } = require("./formatter/formatVenue");
const Venues = require("@VenuesModel");
const venueRepo = require("./venuesRepository");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_VENUES_CACHE_KEY = "venues:active";
const buildVenuesCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_VENUES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
}
const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const mongoose = require("mongoose");

const getVenues = async ({ page, limit, keyword, status, pinned, userId, date, organization }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const cacheKey = buildVenuesCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
  const pipeline = [
    // Join with Organizations collection
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
    // Flatten organizationData array for easier matching
    { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },
    // Match user access (venue creator OR org creator OR org staff)
    {
      $match: {
        $or: [
          { creator: new mongoose.Types.ObjectId(userId) },
          { "organizationData.creator": new mongoose.Types.ObjectId(userId) },
          { "organizationData.staff.user": new mongoose.Types.ObjectId(userId) }
        ]
      }
    }
  ];

  // Apply filters
  if (organization) {
    pipeline.push({
      $match: {
        organization: new mongoose.Types.ObjectId(organization)
      }
    });
  }

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

  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Venues.schema },                       // Venue fields
      { schema: Organizations.schema, prefix: 'organizationData.' } // Organization fields (with prefix)
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }


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


  const result = await Venues.aggregate(pipeline)


  const venues = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Venues.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Venues.countDocuments({ status: "active", creator: userId }),
    Venues.countDocuments({ status: "inactive", creator: userId })
  ]);

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
    },
  });
};

//get venues for menu options dropdown where organization is not assigned yet

const getUnassignedVenues = async (userId) => {
  return await venueRepo.getUnassignedVenues(userId);
};


const updateVenue = async (id, data) => {
  let venue = await venueRepo.findVenueById(id);
  await invalidate(ACTIVE_VENUES_CACHE_KEY);
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

  // Step 1: Update venue fields
  Object.assign(venue, updateData);
  await venue.save();

  // Step 2: If isPrimary = true
  if (updateData.isPrimary) {
    // Ensure only one primary per organization
    await Venues.updateMany(
      {
        organization: venue.organization,
        _id: { $ne: venue._id },
        isPrimary: true
      },
      { $set: { isPrimary: false } }
    );
  }

  // Step 3: If organization changed and isPrimary = true, double-check previous organization
  if (organizationChanged && updateData.isPrimary) {
    // Just to make sure previous org doesn't keep old primary (edge case)
    await Venues.updateMany(
      {
        organization: data.organization, // old org
        isPrimary: true
      },
      { $set: { isPrimary: false } }
    );
  }

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
