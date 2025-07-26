// repositories/venueRepository.js
const Organizations = require("../../organizer/organizations/Organization");
const Venues = require("./Venues");
const mongoose = require("mongoose");

// Create venue in a transaction and update organization
const createVenue = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Create venue
    const venue = new Venues(data);
    await venue.save({ session });

    // Update organization: set organization field in venue, push venue id to organization.venues
    if (data.organization) {
      await Organizations.findByIdAndUpdate(
      data.organization,
      { venue: venue._id },
      { session }
      );
    }
    await session.commitTransaction();
    session.endSession();
    return venue;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

// Get all with filters
const getVenuesWithFilters = async (query, skip, limit) => {
  return Venues.find(query)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countVenues = async (query = {}) => {
  return Venues.countDocuments(query);
};

// Find by ID
const findVenueById = async (id) => {
  return Venues.findById(id);
};

// Update and save
const updateVenueData = async (venue, data) => {
  Object.assign(venue, data);
  return await venue.save();
};

// Delete
const deleteVenueById = async (venue) => {
  return await venue.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Venues.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createVenue,
  getVenuesWithFilters,
  countVenues,
  findVenueById,
  updateVenueData,
  deleteVenueById,
  findByIdAndUpdate,
};
