const {
  isDaypartActiveNow,
  getUtcMinutesAndLocalWeekdayKey,
} = require("../commonSchemas/operatingHours");

/**
 * Filters menu items by:
 *  1. Daypart   — items with no daypart are always shown;
 *                 items with dayparts are shown only when at least one is active now.
 *  2. AvailableDays — items with no days set are always shown;
 *                     items with days set are shown only when today is included.
 *
 * @param {Object[]} menuItems  - Raw menu item docs (daypart = array of ObjectIds/strings)
 * @param {Map}      daypartMap - Map<id string, Daypart doc> from getAllDayparts()
 * @param {string}   timezone   - IANA timezone string (e.g. "Asia/Karachi")
 * @returns {Object[]} Filtered menu items
 */
function filterByDaypartAndDays(menuItems, daypartMap, timezone = "UTC") {
  const { localWeekdayKey } = getUtcMinutesAndLocalWeekdayKey(timezone);

  return menuItems.filter((item) => {
    // ── 1. daypart check ──────────────────────────────────────────────────────
    const daypartIds = Array.isArray(item.daypart) ? item.daypart : [];
    if (daypartIds.length) {
      const anyActive = daypartIds.some((id) => {
        const dp = daypartMap.get(id.toString());
        return isDaypartActiveNow(dp, timezone);
      });
      if (!anyActive) return false;
    }

    // ── 2. availableDays check ────────────────────────────────────────────────
    const days = Array.isArray(item.availableDays) ? item.availableDays : [];
    if (days.length && !days.includes(localWeekdayKey)) return false;

    return true;
  });
}

/**
 * Convenience wrapper — fetches dayparts internally, then filters.
 * Use when you don't already have the daypart map.
 *
 * @param {Object[]} menuItems
 * @param {Function} getAllDaypartsFn  - async () => Daypart[]
 * @param {string}   timezone
 * @returns {Promise<Object[]>}
 */
async function filterByDaypartAndDaysWithFetch(menuItems, getAllDaypartsFn, timezone = "UTC") {
  if (!menuItems.length) return menuItems;

  const allDayparts = await getAllDaypartsFn();

  const daypartMap = new Map(allDayparts.map((d) => [d._id.toString(), d]));

  return filterByDaypartAndDays(menuItems, daypartMap, timezone);
}

module.exports = {
  filterByDaypartAndDays,
  filterByDaypartAndDaysWithFetch,
};
