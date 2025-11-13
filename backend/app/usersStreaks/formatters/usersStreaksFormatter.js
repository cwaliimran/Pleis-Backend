
/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatUsersStreak(streak) {
  if (!streak) return null;

  // Handle both Mongoose doc and plain object
  const streakObj = streak.toObject ? streak.toObject() : { ...streak };
  return {
    ...streakObj,
  };
}

/**
 * Safe formatter for arrays of streaks
 */
function formatUsersStreaks(streaks = []) {
  return streaks.map(formatUsersStreak);
}

module.exports = { formatUsersStreak, formatUsersStreaks };