// Pure streak math shared by check-in (usersStreaksRepository) and the club page streak card.
// No DB access here — keep it side-effect free so it is easy to test.

const moment = require("moment-timezone");

// Periods are calendar-based in the business timezone (venues are in Croatia), not
// rolling windows from the last check-in — otherwise repeat visits inside a period
// keep pushing the window and a weekly visitor never builds a streak.
const STREAK_TIMEZONE = process.env.STREAK_TIMEZONE || "Europe/Zagreb";
const PERIOD_UNIT = { day: "day", week: "isoWeek", month: "month" }; // isoWeek = Monday start
const DIFF_UNIT = { day: "days", week: "weeks", month: "months" };
const BADGE_RANK = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

/**
 * Start of the calendar period (day / ISO week / month) a date falls into.
 */
function getPeriodStart(date, countBase, tz = STREAK_TIMEZONE) {
  const unit = PERIOD_UNIT[countBase];
  if (!unit || !date) return null;
  return moment.tz(date, tz).startOf(unit);
}

/**
 * Number of calendar periods between the last visit and now.
 * 0 = same period (already counted)
 * 1 = next period (streak continues)
 * >1 = at least one period skipped (streak breaks)
 * No previous visit counts as broken (2).
 */
function getPeriodGap(lastVisitAt, now, countBase, tz = STREAK_TIMEZONE) {
  if (!lastVisitAt) return 2;
  const prev = getPeriodStart(lastVisitAt, countBase, tz);
  const curr = getPeriodStart(now, countBase, tz);
  if (!prev || !curr || curr.isBefore(prev)) return 0;
  return curr.diff(prev, DIFF_UNIT[countBase]);
}

/**
 * Highest badge earned for a given streak count.
 * Assumes badges are defined as { title, visits } thresholds.
 */
function getBadgeForStreak(badges = [], streakCount) {
  let earned = "";
  const sorted = [...badges].sort((a, b) => a.visits - b.visits);

  for (const badge of sorted) {
    if (streakCount >= badge.visits) earned = badge.title;
  }

  return earned;
}

/**
 * Core logic: given the active streak rule and the user's existing streak doc,
 * returns what the updated streak values should be. Does NOT save anything —
 * pure calculation, easy to test.
 */
function computeStreakUpdate(streakRule, existingStreak, now = new Date()) {
  const { countBase, badges = [] } = streakRule;

  // First-ever check-in for this user/org
  if (!existingStreak) {
    const badge = getBadgeForStreak(badges, 1);
    return {
      isNew: true,
      visits: 1,
      streak: 1,
      longestStreak: 1,
      badge,
      lastVisitAt: now,
      lastBadgeAwardedAt: badge ? now : null,
    };
  }

  const gap = getPeriodGap(existingStreak.lastVisitAt, now, countBase);

  let { visits, streak, longestStreak } = existingStreak;

  if (gap === 0) {
    // Already checked in during this period — no double counting
    return {
      isNew: false,
      visits,
      streak,
      longestStreak,
      badge: existingStreak.badge,
      lastVisitAt: now, // still bump last seen
      lastBadgeAwardedAt: existingStreak.lastBadgeAwardedAt,
      unchanged: true,
    };
  }

  if (gap === 1) {
    // consecutive period, streak continues
    visits += 1;
    streak += 1;
  } else {
    // gap > 1, streak broken, restart
    visits = 1;
    streak = 1;
  }

  longestStreak = Math.max(longestStreak, streak);

  // Earned badges are kept: a reset streak must not downgrade silver -> bronze.
  const reached = getBadgeForStreak(badges, streak);
  const badge =
    (BADGE_RANK[reached] || 0) > (BADGE_RANK[existingStreak.badge] || 0)
      ? reached
      : existingStreak.badge || reached;
  const badgeChanged = badge && badge !== existingStreak.badge;

  return {
    isNew: false,
    visits,
    streak,
    longestStreak,
    badge,
    lastVisitAt: now,
    lastBadgeAwardedAt: badgeChanged ? now : existingStreak.lastBadgeAwardedAt,
  };
}

module.exports = {
  STREAK_TIMEZONE,
  BADGE_RANK,
  getPeriodStart,
  getPeriodGap,
  getBadgeForStreak,
  computeStreakUpdate,
};
