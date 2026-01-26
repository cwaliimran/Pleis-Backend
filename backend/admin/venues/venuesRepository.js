// repositories/venueRepository.js
const Venues = require("@VenuesModel");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_VENUES_CACHE_KEY = "venues:active";
const buildVenuesCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_VENUES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
}
// Create venue in a transaction and update organization
const createVenue = async (data) => {
  await invalidate(ACTIVE_VENUES_CACHE_KEY);
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (data.organization) {
      // Make all venues ifPrimary to false
      await Venues.updateMany(
        { organization: data.organization, isPrimary: true },
        { isPrimary: false },
        { session }
      );
      // Assign isPrimary true to the new venue
      data.isPrimary = true;
    }
    // Create venue
    const venue = new Venues(data);
    await venue.save({ session });

    await session.commitTransaction();
    session.endSession();
    return venue;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// Get all venues with their assigned organization populated, sorted by createdAt descending
const getVenuesWithFilters = async (
  query = {},
  skip = 0,
  limit = 10
) => {
  const cacheKey = buildVenuesCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const venues = await Venues.find(query)
        .populate({
          path: "organization",
          select: "basicInfo otherInfo",
        })
        .populate({
          path: "venueType",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return venues;
    },
  });
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
  await invalidate(ACTIVE_VENUES_CACHE_KEY);
  return await venue.save();
};

// Delete
const deleteVenueById = async (venue) => {
  await invalidate(ACTIVE_VENUES_CACHE_KEY);
  return await venue.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_VENUES_CACHE_KEY);
  return Venues.findByIdAndUpdate(id, data, { new: true });
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
