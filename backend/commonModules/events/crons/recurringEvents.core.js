const { Events } = require("@EventsModel");
const TicketingsModel = require("@TicketingsModel");

/**
 * recurringEvents.core.js
 *
 * ✅ CORE LOGIC ONLY
 * ✅ UTC SAFE
 * ✅ Supports multi-day recurring events
 * ✅ Supports:
 *    - daily / weekly
 *    - interval
 *    - endType: never | onDate | afterOccurrences
 * ✅ Rolling horizon generation
 */

// ======================================================
// CONFIG
// ======================================================
const HORIZON_DAYS = 7; // create events N days ahead
const DAY_MS = 24 * 60 * 60 * 1000; // milliseconds in a day

// ======================================================
// DATE HELPERS (UTC SAFE)
// ======================================================
const startOfDayUTC = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const addDaysUTC = (d, days) =>
  new Date(d.getTime() + days * DAY_MS);

const diffDaysUTC = (a, b) =>
  Math.floor((startOfDayUTC(b) - startOfDayUTC(a)) / DAY_MS);

const withSameTimeUTC = (day, ref) =>
  new Date(Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    ref.getUTCHours(),
    ref.getUTCMinutes(),
    ref.getUTCSeconds(),
    ref.getUTCMilliseconds()
  ));

const mergeDateAndTimeUTC = (day, time) =>
  new Date(Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    time.getUTCHours(),
    time.getUTCMinutes(),
    0,
    0
  ));

// ======================================================
// MAIN CRON ENTRY
// ======================================================
const runRecurringEventsCron = async () => {
  const now = new Date();
  const horizonDate = addDaysUTC(startOfDayUTC(now), HORIZON_DAYS);

  const templates = await Events.find({
    "schedule.recurringDetails.isEnabled": true,
    "recurringMeta.isTemplate": true,
    status: "active",
  });

  for (const template of templates) {
    try {
      await processTemplate(template, horizonDate);
    } catch (err) {
      console.error("Recurring cron error:", template._id, err);
    }
  }
};

// ======================================================
// PROCESS ONE TEMPLATE
// ======================================================
const processTemplate = async (template, horizonDate) => {
  // Existing upcoming occurrences (avoid duplicates)
const existing = await Events.find({
  "recurringMeta.parentEvent": template._id
}).select("schedule.startDateTime recurringMeta.occurrenceIndex");

  const existingKeySet = new Set(
    existing.map(e => e.schedule.startDateTime.getTime())
  );

  // Count total already-created occurrences (for afterOccurrences)
  const existingCount = await Events.countDocuments({
    "recurringMeta.parentEvent": template._id,
  });

  const lastOccurrence = await Events.findOne({
    "recurringMeta.parentEvent": template._id,
  })
    .sort({ "recurringMeta.occurrenceIndex": -1 })
    .select("recurringMeta.occurrenceIndex");

  let nextOccurrenceIndex =
    lastOccurrence?.recurringMeta?.occurrenceIndex
      ? lastOccurrence.recurringMeta.occurrenceIndex + 1
      : 1;

const dates = await getUpcomingDates(template, horizonDate, existingCount);

  for (const date of dates) {
    const key = date.getTime();
    if (existingKeySet.has(key)) continue;

    await createOccurrence(template, date, nextOccurrenceIndex);
    nextOccurrenceIndex++;
  }
};

// ======================================================
// GENERATE UPCOMING DATES
// ======================================================
const getUpcomingDates = async (template, horizonDate, existingCount) => {
  const rule = template.schedule.recurringDetails;

  // REAL ANCHOR: first occurrence, NOT template
  const firstOccurrence = await Events.findOne({
    "recurringMeta.parentEvent": template._id
  })
  .sort({ "recurringMeta.occurrenceIndex": 1 })
  .select("schedule.startDateTime");

  const baseStart = firstOccurrence
    ? new Date(firstOccurrence.schedule.startDateTime)
    : new Date(template.schedule.startDateTime);

  const baseDay = startOfDayUTC(baseStart);


  const today = startOfDayUTC(new Date());
  let cursor = baseDay > today ? baseDay : today;

  const list = [];
  let generatedCount = existingCount;

  const recurrenceEndDate =
    rule.endType === "onDate" && rule.endDate
      ? startOfDayUTC(new Date(rule.endDate))
      : null;

  while (cursor <= horizonDate) {

    // ======================
    // STOP CONDITIONS
    // ======================
    if (
      rule.endType === "onDate" &&
      recurrenceEndDate &&
      cursor > recurrenceEndDate
    ) {
      break;
    }

    if (
      rule.endType === "afterOccurrences" &&
      generatedCount >= rule.occurrences
    ) {
      break;
    }

    // ======================
    // DAILY
    // ======================
    if (rule.frequency === "daily") {
      const diff = diffDaysUTC(baseDay, cursor);
      if (diff >= 0 && diff % rule.interval === 0) {
        list.push(withSameTimeUTC(cursor, baseStart));
        generatedCount++;
      }
      cursor = addDaysUTC(cursor, 1);
      continue;
    }

    // ======================
    // WEEKLY
    // ======================
    if (rule.frequency === "weekly") {
      const diffWeeks = Math.floor(diffDaysUTC(baseDay, cursor) / 7);

      const weekday = cursor
        .toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })
        .toLowerCase()
        .slice(0, 3);

      const weekdayAllowed =
        !rule.daysOfWeek.length || rule.daysOfWeek.includes(weekday);

      if (
        diffWeeks >= 0 &&
        diffWeeks % rule.interval === 0 &&
        weekdayAllowed
      ) {
        list.push(withSameTimeUTC(cursor, baseStart));
        generatedCount++;
      }

      cursor = addDaysUTC(cursor, 1);
      continue;
    }

    cursor = addDaysUTC(cursor, 1);
  }

  return list;
};

// ======================================================
// CREATE REAL EVENT (OCCURRENCE)
// ======================================================
const createOccurrence = async (template, startDate, index) => {
  const durationMs =
    template.schedule.endDateTime -
    template.schedule.startDateTime;

  const newEvent = await Events.create({
    basicInfo: template.basicInfo,
    schedule: {
      type: "oneTime",
      startDateTime: startDate,
      endDateTime: new Date(startDate.getTime() + durationMs),
      recurringDetails: null,
    },
    creator: template.creator,
    status: "active",
    recurringMeta: {
      parentEvent: template._id,
      isTemplate: false,
      occurrenceIndex: index,
    },
  });

  await cloneTicketing(template._id, newEvent._id);
};

// ======================================================
// CLONE TICKETING + TIMING SLOTS
// ======================================================
const cloneTicketing = async (templateEventId, newEventId) => {
  const tickets = await TicketingsModel.find({
    event: templateEventId,
    status: { $ne: "deleted" },
  });

  if (!tickets.length) return;

  const newEvent = await Events.findById(newEventId);

  for (const t of tickets) {
    const clone = t.toObject();
    delete clone._id;

    clone.event = newEventId;

    if (clone.timingSlots?.enabled) {
      clone.timingSlots.dateTimeSlots = rebuildSlots(
        t.timingSlots.dateTimeSlots,
        newEvent.schedule.startDateTime
      );
    }

    await TicketingsModel.create(clone);
  }
};

// ======================================================
// REBUILD TIME SLOTS FOR OCCURRENCE
// ======================================================
const rebuildSlots = (blocks, newEventStart) => {
  if (!blocks?.length) return [];

  const baseDay = startOfDayUTC(blocks[0].date);
  const newBaseDay = startOfDayUTC(newEventStart);

  return blocks.map(block => {
    const offset = diffDaysUTC(baseDay, startOfDayUTC(block.date));
    const blockDay = addDaysUTC(newBaseDay, offset);

    return {
      date: blockDay,
      timeSlots: block.timeSlots.map(slot => ({
        quantity: slot.quantity,
        startTime: mergeDateAndTimeUTC(blockDay, slot.startTime),
        endTime: mergeDateAndTimeUTC(blockDay, slot.endTime),
      })),
    };
  });
};


const generateImmediatelyForTemplate = async (templateId) => {
  const template = await Events.findOne({
    _id: templateId,
    "recurringMeta.isTemplate": true,
    "schedule.recurringDetails.isEnabled": true,
    status: "active",
  });

  if (!template) return;

  const horizonDate = addDaysUTC(startOfDayUTC(new Date()), HORIZON_DAYS);
  await processTemplate(template, horizonDate);
};


// ======================================================
// EXPORT
// ======================================================
module.exports = {
  runRecurringEventsCron,
  generateImmediatelyForTemplate
};
