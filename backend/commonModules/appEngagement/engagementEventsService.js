const { pushBuffer } = require("@redisCache");
const engagementRepo = require("./engagementEventsRepository");

/**
 * Public API to log engagement
 * Controllers call THIS — never the repo directly
 */
const logEngagementService = async ({
  entityType,
  entityId,
  action,
  userId
}) => {

  const payload = {
    entityType,
    entityId,
    action,
    userId,
    createdAt: new Date()
  };

  try {
    // Push into Redis buffer
    await pushBuffer("engagement", payload);
    return true;
  } catch (err) {
    // Fallback → direct Mongo insert
    return engagementRepo.logEngagement(payload);
  }
};


/**
 * Get trending entities (48h / 7d handled upstream)
 */
const getTrendingService = async ({
  entityType,
  action,
  since,
  limit
}) => {
  return engagementRepo.getTrendingEntities({
    entityType,
    action,
    since,
    limit
  });
};

/**
 * Count engagement for analytics
 */
const countEngagementService = async ({
  entityType,
  entityId,
  action,
  since
}) => {
  return engagementRepo.countEngagementsByEntity({
    entityType,
    entityId,
    action,
    since
  });
};

module.exports = {
  logEngagementService,
  getTrendingService,
  countEngagementService
};
