// services/venueService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const Organizations = require("../../organizer/organizations/Organization");
const Venues = require("./Venues");
const venueRepo = require("./venuesRepository");

const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const getVenues = async ({ page, limit, keyword, status, pinned, userId, date }) => {
  const query = {
    creator: userId,
  };
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }
  if (pinned !== undefined) {
    query.$or = [
      ...(query.$or || []),
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [venues, totalFiltered, total, active, inactive] =
    await Promise.all([
      venueRepo.getVenuesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      venueRepo.countVenues(query),
      venueRepo.countVenues({ creator: userId, status: { $ne: "deleted" } }),
      venueRepo.countVenues({ status: "active", creator: userId }),
      venueRepo.countVenues({ status: "inactive", creator: userId }),
    ]);


const formattedVenues = venues.map(venue => {
  const venueDoc = new Venues(venue);
  const formattedVenue = venueDoc.formatResponse();

  if (venue.organizations && Array.isArray(venue.organizations)) {
    formattedVenue.organizations = venue.organizations.map(org => {
      return Organizations.prototype.formatResponse(org);
    });
  }

  return formattedVenue;
});



  let meta = generateMeta(page, limit, totalFiltered);
  meta.venuesCount = { total, active, inactive };
  return {
    venues: formattedVenues,
    meta,
  };
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
  deleteVenue
};
