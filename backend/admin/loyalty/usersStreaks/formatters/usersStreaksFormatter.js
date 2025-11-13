const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");

/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatUsersStreak(streak) {
  if (!streak) return null;

  // Handle both Mongoose doc and plain object
  let streakObj = streak.toObject ? streak.toObject() : { ...streak };
  if (!streakObj) return null;

  if (streakObj.user && typeof streakObj.user === 'object') {
    streakObj.user.profileIcon = getFullImageUrl(streakObj.user.profileIcon || "noimage.png");
  }
  return streakObj;
}

/**
 * Safe formatter for arrays of streaks
 */
function formatUsersStreaks(streaks = []) {
  return streaks.map(formatUsersStreak);
}

module.exports = { formatUsersStreak, formatUsersStreaks };