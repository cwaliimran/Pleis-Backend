// repositories/engagementRepository.js
const EngagementEvents = require("@EngagementEventsModel");

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

module.exports = {
  logEngagement,
  countEngagementsByEntity,
  getTrendingEntities,
  deleteEngagementsBefore
};
