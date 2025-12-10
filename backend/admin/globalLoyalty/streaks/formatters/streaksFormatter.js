
/**
 * Pure formatter for category objects (safe for doc or plain object)
 */
function formatStreak(streak) {
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
function formatStreaks(streaks = []) {
  return streaks.map(formatStreak);
}

module.exports = { formatStreak, formatStreaks };