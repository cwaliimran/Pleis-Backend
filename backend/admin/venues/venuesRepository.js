// repositories/venueRepository.js
const Venues = require("@VenuesModel");
const mongoose = require("mongoose");
const { getOrgCompanyOrganizer } = require("../organizations/organizationRepository");
const Organizations = require("../../commonModules/organizations/Organization");
const { cache, invalidate } = require("@redisCache");

const ACTIVE_VENUES_TYPE_MAP_KEY = "venues:active:typeMap";

const invalidateVenueCaches = async () => {
  await invalidate(ACTIVE_VENUES_TYPE_MAP_KEY);
  await invalidate("home:pinned-content");
};

// Create venue in a transaction and update organization
const createVenue = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (data.organization) {
      //get organization companyOrganizer
      let creator = await getOrgCompanyOrganizer(data.organization);
      data.creator = creator;
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

    // 🔒 Keep this INSIDE transaction for atomicity
    if (data.organization) {
      await Organizations.updateOne(
        { _id: data.organization },
        { $set: { location: data.location } },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    await invalidateVenueCaches();

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
  const venues = await Venues.find(query)
    .populate({
      path: "organization",
      select: "basicInfo otherInfo",
    })
    .populate({
      path: "venueType",
    })
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return venues;
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
    creator: userId,
    
  }).sort({ title: 1 });
};

/**
 * Slim active venue → venueType map (full catalog, Redis-cached).
 * Used by pinned/home batch queries instead of uncapped Venues.find per request.
 */
const getActiveVenueTypeMap = async () => {
  return cache({
    namespace: ACTIVE_VENUES_TYPE_MAP_KEY,
    ttl: 86400,
    fetchFn: async () => {
      const venues = await Venues.find({
        status: "active",
        venueType: { $exists: true, $ne: [] },
      })
        .select("_id venueType organization")
        .lean();

      return (venues || []).map((v) => ({
        _id: String(v._id),
        organization: v.organization ? String(v.organization) : null,
        venueType: Array.isArray(v.venueType)
          ? v.venueType.map((x) => String(x))
          : [],
      }));
    },
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
  getActiveVenueTypeMap,
  ACTIVE_VENUES_TYPE_MAP_KEY,
  invalidateVenueCaches,
};
