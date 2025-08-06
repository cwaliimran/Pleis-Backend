// services/venueService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const venueRepo = require("./venuesRepository");

const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const getVenues = async ({ page, limit, keyword, status, pinned, userId }) => {
  const query = {
    creator: userId,
  };
  if (status) query.status = status;
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

  const [venues, totalFiltered, total, active, inactive, deleted] =
    await Promise.all([
      venueRepo.getVenuesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      venueRepo.countVenues(query),
      venueRepo.countVenues({ creator: userId }),
      venueRepo.countVenues({ status: "active", creator: userId }),
      venueRepo.countVenues({ status: "inactive", creator: userId }),
      venueRepo.countVenues({ status: "deleted", creator: userId }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.venuesCount = { total, active, inactive, deleted };
  return {
    venues,
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
