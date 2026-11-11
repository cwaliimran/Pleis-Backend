const { getPeriodGap, getBadgeForStreak, BADGE_RANK } = require("../../../usersStreaks/streakCalculations");
const titleCase = (s = "") => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Club page streak card payload, built from the club's active streak rule
 * (admin streaks-v2: countBase + badge ladder) and the user's streak docs.
 *
 * Returns null when the club has no active rule (app hides the Streaks tab).
 * Legacy fields (message/currentVisit/NextVisit/TotalPoints) are kept for older app builds.
 */
const formatNextStreakRule = async (streakRules = [], userStreaks = [], now = new Date()) => {
  const rule = Array.isArray(streakRules) ? streakRules[0] : streakRules;
  if (!rule || !Array.isArray(rule.badges) || !rule.badges.length) return null;

  const { countBase } = rule;
  const badges = [...rule.badges]
    .sort((a, b) => a.visits - b.visits)
    .map((b) => ({ key: b.title, name: titleCase(b.title), at: b.visits }));

  // A user can have one streak doc per organization of the club — show the best one.
  // A stored streak is only "live" if the next period hasn't been missed yet.
  let currentStreak = 0;
  let longestStreak = 0;
  let totalVisits = 0;
  let badgeKey = "";
  let lastVisitAt = null;

  for (const s of userStreaks || []) {
    const broken = s.lastVisitAt && getPeriodGap(s.lastVisitAt, now, countBase) > 1;
    currentStreak = Math.max(currentStreak, broken ? 0 : s.streak || 0);
    longestStreak = Math.max(longestStreak, s.longestStreak || 0, s.streak || 0);
    totalVisits += s.visits || 0;
    if ((BADGE_RANK[s.badge] || 0) > (BADGE_RANK[badgeKey] || 0)) badgeKey = s.badge;
    if (s.lastVisitAt && (!lastVisitAt || s.lastVisitAt > lastVisitAt)) lastVisitAt = s.lastVisitAt;
  }

  // Earned badges are kept even after a streak breaks.
  const derived = getBadgeForStreak(rule.badges, longestStreak);
  if ((BADGE_RANK[derived] || 0) > (BADGE_RANK[badgeKey] || 0)) badgeKey = derived;

  const earnedIndex = badges.findIndex((b) => b.key === badgeKey);
  const next = badges[earnedIndex + 1] || null;
  const nextBadge = next
    ? { ...next, remaining: Math.max(0, next.at - currentStreak) }
    : null;

  return {
    countBase,
    badges,
    currentStreak,
    longestStreak,
    totalVisits,
    highestBadge: earnedIndex >= 0 ? badges[earnedIndex].name : null,
    nextBadge,
    lastVisitAt,

    // legacy shape (components/loyalty/Streaks.js)
    message: !userStreaks?.length
      ? "No streak found for user"
      : nextBadge ? "Next streak rule found" : "You reached max visit",
    currentVisit: currentStreak,
    NextVisit: nextBadge ? nextBadge.at : currentStreak,
    TotalPoints: 0,
  };
};

module.exports = {
  formatNextStreakRule,
};
