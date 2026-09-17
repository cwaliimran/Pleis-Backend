// repositories/venueRepository.js
const Venues = require("@VenuesModel");
const mongoose = require("mongoose");
const Organizations = require("@OrganizationModel");
const { ACTIVE_ORGANIZATIONS_CACHE_KEY } = require("../../admin/organizations/organizationService");
const { cache, invalidate } = require("@redisCache");
const {
  invalidateVenueCaches,
} = require("../../admin/venues/venuesRepository");

// Create venue in a transaction and update organization
const createVenue = async (data) => {
  const session = await mongoose.startSession();

  try {
    let venue;

    await session.withTransaction(async () => {

      if (data.organization) {
        await Venues.updateMany(
          { organization: data.organization, isPrimary: true },
          { isPrimary: false },
          { session }
        );

        data.isPrimary = true;
      }

      venue = await Venues.create([data], { session })
        .then(res => res[0]);

      // 🔒 Keep this INSIDE transaction for atomicity
      if (data.organization) {
        await Organizations.updateOne(
          { _id: data.organization },
          { $set: { location: data.location } },
          { session }
        );
      }

    });

    // 🚀 Outside transaction (non-DB side effects only)
    if (data.organization) {
      await invalidate(ACTIVE_ORGANIZATIONS_CACHE_KEY);
    }
    await invalidateVenueCaches();

    return venue;

  } finally {
    await session.endSession();
  }
};

// Get all venues with their assigned organization populated, sorted by createdAt descending
const getVenuesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Venues.find(query)
    .populate({
      path: "organization",
      select: "basicInfo otherInfo"
    })
    .populate({
      path: "venueType",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countVenues = async (query = {}) => {
  return Venues.countDocuments(query);
};

// Find by ID
//with select option
//select example ['title', 'location']
const findVenueById = async (id, select = []) => {
  if (select.length > 0) {
    return Venues.findById(id).select(select.join(" "));
  }
  return Venues.findById(id);
};

// Update and save
const updateVenueData = async (venue, data) => {
  Object.assign(venue, data);
  const updated = await venue.save();
  await invalidateVenueCaches();
  return updated;
};

// Delete
const deleteVenueById = async (venue) => {
  const result = await venue.deleteOne();
  await invalidateVenueCaches();
  return result;
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  const updated = await Venues.findByIdAndUpdate(id, data, { new: true });
  await invalidateVenueCaches();
  return updated;
};

//get venues for menu options dropdown where organization is not assigned yet

const getUnassignedVenues = async (userId) => {
  return await Venues.find({
    status: "active",
    organization: { $in: [null, undefined] },
    creator: userId
  });
};


module.exports = {
  createVenue,
  getVenuesWithFilters,
  countVenues,
  getUnassignedVenues,
  findVenueById,
  updateVenueData,
  deleteVenueById,
  findByIdAndUpdate,
};
