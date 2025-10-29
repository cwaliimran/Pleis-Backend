const { Events } = require("../../commonModules/events/Event");
const Organizations = require("../../commonModules/organizations/Organization");
const mongoose = require("mongoose");
/**
 * Fetch one organization by ID (populated)
 */
const findOrganizationById = async (organizationId) => {
  return Organizations.findById(organizationId)
    .where({ status: "active" })
    .populate("otherInfo.categories")
    .populate("otherInfo.tags");
};

/**
 * Generic queries (if needed later)
 */
const findOrganizations = async (query = {}, projection = {}, options = {}) => {
  return Organizations.find(query, projection, options)
    .populate("otherInfo.categories")
    .populate("otherInfo.tags");
};

/**
 * Count organizations by query
 */
const countOrganizations = async (query = {}) => {
  return Organizations.countDocuments(query);
};

/**
 * Update multiple organizations
 */
const updateMany = async (filter, update) => {
  return Organizations.updateMany(filter, update);
};

/**
 * Find all events for a given organization with optional date filter
 * @param {ObjectId} organizationId
 * @param {Object} filter - optional filter (e.g. { "schedule.startDateTime": { $gte: ... } })
 */
const findEventsByOrganization = async (organizationId, filter = {}, skip = 0, limit = 10) => {
  return Events.find({
    "basicInfo.organization": organizationId,
    status: "active",
    ...filter,
  })
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.media basicInfo.name")
    .sort({ "schedule.startDateTime": 1 })
    .skip(skip)
    .limit(limit);
};


/**
 * Count organization events — total, upcoming, and past
 */
const countEventsByOrganization = async (organizationId, now) => {
  const [globalCounts] = await Promise.all([
    // Aggregate global counts
    Events.aggregate([
      {
        $match: {
          "basicInfo.organization": new mongoose.Types.ObjectId(organizationId),
          status: { $ne: "deleted" },
        },
      },
      {
        $facet: {
          upcoming: [
            { $match: { "schedule.startDateTime": { $gte: now } } },
            { $count: "count" },
          ],
          past: [
            { $match: { "schedule.endDateTime": { $lt: now } } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          upcoming: { $ifNull: [{ $arrayElemAt: ["$upcoming.count", 0] }, 0] },
          past: { $ifNull: [{ $arrayElemAt: ["$past.count", 0] }, 0] },
        },
      },
    ]),
  ]);

  const counts = globalCounts[0] || {};
  return {
    upcoming: counts.upcoming || 0,
    past: counts.past || 0,
  };
};

module.exports = {
  findEventsByOrganization,
  countEventsByOrganization,
  findOrganizationById,
  findOrganizations,
  countOrganizations,
  updateMany,
};
