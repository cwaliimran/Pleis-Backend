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
  return engagementRepo.logEngagement({
    entityType,
    entityId,
    action,
    userId
  });
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
