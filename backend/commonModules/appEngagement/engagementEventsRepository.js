// repositories/engagementRepository.js
const EngagementEvents = require("@EngagementEventsModel");
const { default: mongoose } = require("mongoose");

/* =====================================================
   CONFIG — TTL RULES
   ===================================================== */

const ACTION_TTL_HOURS = {
  view: 24,
  click: 6,
  open: 6
};

/* =====================================================
   INTERNAL HELPERS
   ===================================================== */

const getSinceDateForAction = (action) => {
  const hours = ACTION_TTL_HOURS[action];
  if (!hours) return null;

  return new Date(Date.now() - hours * 60 * 60 * 1000);
};

/* =====================================================
   CREATE (SAFE ENTRY POINT)
   ===================================================== */

/**
 * Safely log engagement with dedup rules
 */
const logEngagement = async ({
  entityType,
  entityId,
  action,
  userId = null
}) => {

  // 1️⃣ Favorites → DB-level unique index handles it
  if (action === "favorite") {
    try {
      return await EngagementEvents.create({
        entityType,
        entityId,
        action,
        userId
      });
    } catch (err) {
      // Duplicate favorite → ignore silently
      if (err.code === 11000) return null;
      throw err;
    }
  }

  // 2️⃣ Shares → always log
  if (action === "share") {
    return EngagementEvents.create({
      entityType,
      entityId,
      action,
      userId
    });
  }

  // 3️⃣ Views / Click / Open → TTL based
  const since = getSinceDateForAction(action);

  if (userId && since) {
    const exists = await EngagementEvents.exists({
      entityType,
      entityId,
      action,
      userId,
      createdAt: { $gte: since }
    });

    if (exists) return null;
  }

  return EngagementEvents.create({
    entityType,
    entityId,
    action,
    userId
  });
};

/* =====================================================
   COUNTS / ANALYTICS
   ===================================================== */

const countEngagementsByEntity = async ({
  entityType,
  entityId,
  action,
  since = null
}) => {
  const query = { entityType, entityId, action };
  if (since) query.createdAt = { $gte: since };
  return EngagementEvents.countDocuments(query);
};

const getTrendingEntities = async ({
  entityType,
  action = "view",
  since,
  limit = 10
}) => {
  return EngagementEvents.aggregate([
    {
      $match: {
        entityType,
        action,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: "$entityId",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

/* =====================================================
   CLEANUP
   ===================================================== */

const deleteEngagementsBefore = async (beforeDate) => {
  return EngagementEvents.deleteMany({
    createdAt: { $lt: beforeDate }
  });
};


/**
 * Get engagement counts for an entity with multiple actions in ONE query
 */
const getEngagementCountsByEntity = async ({
  entityType,
  entityId,
  actions = [],      // array of actions to count e.g ["view", "favorite"]
  since = null
}) => {
  if (!actions.length) return {};

  const matchStage = {
    entityType,
    entityId: new mongoose.Types.ObjectId(entityId),
    action: { $in: actions }
  };

  if (since) {
    matchStage.createdAt = { $gte: since };
  }

  const results = await EngagementEvents.aggregate([
    { $match: matchStage },

    {
      $group: {
        _id: "$action",
        count: { $sum: 1 }
      }
    }
  ]);

  // Normalize output (ensure all actions exist)
  const stats = actions.reduce((acc, action) => {
    acc[action] = 0;
    return acc;
  }, {});

  for (const row of results) {
    stats[row._id] = row.count;
  }

  return stats;
};


/**
 * Get weekly engagement stats (Mon → Sun)
 *
 * @param {String} entityType - "events" | "organizations" | "users"
 * @param {String|ObjectId} entityId
 * @param {String} action - "view" | "favorite" | "share" | "open"
 */

/*  Example Usage:
const weeklyViews = await getWeeklyEngagementStats({
  entityType: "events",
  entityId: eventId,
  action: "view"
});

*/
const getWeeklyEngagementStats = async ({
  entityType,
  entityId,
  action
}) => {
  const entityObjectId =
    typeof entityId === "string"
      ? new mongoose.Types.ObjectId(entityId)
      : entityId;

  // ---- ISO Week (Mon → Sun) ----
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;

  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + diffToMonday,
    0, 0, 0
  ));

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  const results = await EngagementEvents.aggregate([
    {
      $match: {
        entityType,
        entityId: entityObjectId,
        action,
        createdAt: { $gte: weekStart, $lt: weekEnd }
      }
    },
    {
      $addFields: {
        dayOfWeek: { $isoDayOfWeek: "$createdAt" } // 1=Mon ... 7=Sun
      }
    },
    {
      $group: {
        _id: "$dayOfWeek",
        count: { $sum: 1 }
      }
    }
  ]);

  // ---- Normalize output (Mon → Sun) ----
  const dayMap = {
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
    7: "Sun"
  };

  const base = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0
  };

  for (const row of results) {
    base[dayMap[row._id]] = row.count;
  }

  return Object.entries(base).map(([day, visitors]) => ({
    day,
    visitors
  }));
};

const getTotalEngagementEventsByOrganizationId = async (organizationId) => {
  try {
    // Ensure the organizationId is converted to ObjectId if it's a string
    const objectId = new mongoose.Types.ObjectId(organizationId);

    // Count the number of documents where entityType is "organization" and entityId matches the organizationId
    const eventCount = await EngagementEvents.countDocuments({
      entityType: "organizations",
      action: "view", // You can change this to count different actions if needed
      entityId: objectId
    });

    return eventCount; // Return the total count of matching events
  } catch (error) {
 
    return 0; // Return 0 if there was an error
  }
};
/**
 * Get total views count per event
 * @param {Array<string|ObjectId>} eventIds
 * @param {Date|null} since (optional time filter)
 * @returns {Array<{ event: ObjectId, totalViews: number }>}
 */
const getEventsViewsStats = async (eventIds = [], since = null) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return [];
  }

  const objectIds = eventIds.map(
    id => new mongoose.Types.ObjectId(id)
  );

  const matchStage = {
    entityType: "events",
    action: "view",
    entityId: { $in: objectIds }
  };

  if (since) {
    matchStage.createdAt = { $gte: since };
  }

  const results = await EngagementEvents.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$entityId",
        totalViews: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        event: "$_id",
        totalViews: 1
      }
    }
  ]);

  return results;
};

const getUserIdsForOrganization = async (eventId) => {
  try {
    const users = await EngagementEvents.aggregate([
      {
        $match: {
          entityType: "events",
          entityId: new mongoose.Types.ObjectId(eventId) // Match the organizationId
        }
      },
      {
        $group: {
          _id: null,
          userIds: { $addToSet: "$userId" } // Collect unique userIds in an array
        }
      },
      {
        $project: {
          _id: 0,
          userIds: 1 // Return only the userIds array
        }
      }
    ]);

    return users.length > 0 ? users[0].userIds : []; // Return the user IDs array or an empty array if no users
  } catch (err) {
    console.error("Error fetching user IDs:", err);
    return [];
  }
};
const getUserIdsForOrganizationOrganizaerView = async (organization) => {
  try {
    const users = await EngagementEvents.aggregate([
      {
        $match: {
          entityType: "organizations",
          entityId: new mongoose.Types.ObjectId(organization) // Match the organizationId
        }
      },
      {
        $group: {
          _id: null,
          userIds: { $addToSet: "$userId" } // Collect unique userIds in an array
        }
      },
      {
        $project: {
          _id: 0,
          userIds: 1 // Return only the userIds array
        }
      }
    ]);

    return users.length > 0 ? users[0].userIds : []; // Return the user IDs array or an empty array if no users
  } catch (err) {
    console.error("Error fetching user IDs:", err);
    return [];
  }
};
module.exports = {
  logEngagement,
  getUserIdsForOrganization,
  countEngagementsByEntity,
  getTrendingEntities,
  getUserIdsForOrganizationOrganizaerView,
  deleteEngagementsBefore,
  getEngagementCountsByEntity,
  getWeeklyEngagementStats,
  getTotalEngagementEventsByOrganizationId,
  getEventsViewsStats
};
