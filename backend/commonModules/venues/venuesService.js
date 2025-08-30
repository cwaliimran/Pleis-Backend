// services/venueService.js
const { buildKeywordQueryFromModel } = require("../../helperUtils/queryUtil");
const { generateMeta } = require("../../helperUtils/responseUtil");
const Organizations = require("../organizations/Organization");
const Venues = require("./Venues");
const venueRepo = require("./venuesRepository");

const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const mongoose = require("mongoose");

const getVenues = async ({ page, limit, keyword, status, pinned, userId, date, organization }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Join with Organizations collection
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organizationData"
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

  if (keyword && keyword.trim() !== "") {
    pipeline.push({
      $match: buildKeywordQueryFromModel(Venues, keyword)
    });
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

  const result = await Venues.aggregate(pipeline);

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
      formattedVenue.organization = Organizations.prototype.formatResponse(venue.organizationData);
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
  // Find the existing venue first
  const venue = await venueRepo.findVenueById(id);
  if (!venue) return null;

  // Only update provided fields that exist in the venue
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
    return venue;
  }

  const updated = await venueRepo.findByIdAndUpdate(id, updateData);
  // If updating to primary, set all other venues for this organization to isPrimary: false
  if (data.isPrimary && venue.organization) {
    await Venues.updateMany(
      { organization: venue.organization, isPrimary: true, _id: { $ne: venue._id } },
      { isPrimary: false }
    );
  }

  return updated;
};

const deleteVenue = async (id) => {
  const updated = await venueRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};
const getVenueDetails = async (id) => {
  const venue = await venueRepo.findVenueById(id);
  if (!venue) return null;
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
