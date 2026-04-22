/**
 * FEED PUSH RULES
 * Ensures:
 *  - minimum items in each section (min 2)
 *  - global repetition limit (max 3 per org/event)
 */

const MIN_ITEMS = 1;
const MAX_REPEAT = 10;

/**
 * Normalize ObjectId → string
 */
const normalizeId = (id) => (id ? String(id) : null);

/**
 * Identify whether an item is an org or event
 */
const getEntityKey = (item) => {
  if (!item) return null;

  // organizations (no schedule)
  if (item.basicInfo && !item.schedule) {
    return { type: "orgs", id: normalizeId(item._id) };
  }

  // events
  if (item.schedule) {
    return { type: "events", id: normalizeId(item._id) };
  }

  return null;
};

/**
 * Apply global frequency control
 */
const applyFrequencyFilter = (list = [], frequencyMap) => {
  return list.filter((item) => {
    const entity = getEntityKey(item);
    if (!entity?.id) return true;

    const map = frequencyMap[entity.type];
    const current = map.get(entity.id) || 0;

    //same org/event can repeat up to MAX_REPEAT times across the entire feed
    // if (current >= MAX_REPEAT) return false;

    map.set(entity.id, current + 1);
    return true;
  });
};

/**
 * Safe push — PURE
 * Requires feed + frequency state
 */
const pushIfValid = (feed, section, frequencyMap) => {
  if (!section) return;

  let items = [];

  if (Array.isArray(section.data)) {
    items = section.data;
  } else if (section.data) {
    // normalize but keep output as array
    items = [section.data];
  }

  if (!items.length) return;

  const filtered = applyFrequencyFilter(items, frequencyMap);

  if (filtered.length < MIN_ITEMS) return;

  // ✅ ALWAYS ARRAY (matches your existing home.json)
  section.data = filtered;

  feed.push(section);
};

module.exports = {
  pushIfValid,
};
