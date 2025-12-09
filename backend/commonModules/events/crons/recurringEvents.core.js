const { Events } = require("@EventsModel");
const TicketingsModel = require("@TicketingsModel");
/**
 * recurringEvents.core.js
 *
 * CORE LOGIC ONLY
 * - Uses existing Events & TicketingsModel
 * - Creates rolling recurring events
 * - Handles timingSlots correctly
 * - Safe to run daily via cron
 */


// ======================================================
// CONFIG
// ======================================================
const HORIZON_DAYS = 7; // keep events bookable N days ahead
const DAY_MS = 24 * 60 * 60 * 1000;


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
  const horizonDate = addDaysUTC(now, HORIZON_DAYS);

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
  const dates = getUpcomingDates(template, horizonDate);

  const existing = await Events.find({
    "recurringMeta.parentEvent": template._id,
    "schedule.startDateTime": { $gte: new Date() },
  }).select("schedule.startDateTime");

  const existingKeys = new Set(
    existing.map(e => startOfDayUTC(e.schedule.startDateTime).getTime())
  );

  const lastOccurrence = await Events.findOne({
    "recurringMeta.parentEvent": template._id,
  })
    .sort({ "recurringMeta.occurrenceIndex": -1 })
    .select("recurringMeta.occurrenceIndex");

  let occurrenceIndex = lastOccurrence?.recurringMeta?.occurrenceIndex
    ? lastOccurrence.recurringMeta.occurrenceIndex + 1
    : 1;

  for (const date of dates) {
    const key = startOfDayUTC(date).getTime();
    if (existingKeys.has(key)) continue;

    await createOccurrence(template, date, occurrenceIndex);
    occurrenceIndex++;
  }
};



// ======================================================
// GENERATE UPCOMING DATES (DAILY + WEEKLY)
// ======================================================
const getUpcomingDates = (template, horizonDate) => {
  const rule = template.schedule.recurringDetails;
  const baseStart = new Date(template.schedule.startDateTime);
  const list = [];

  const today = startOfDayUTC(new Date());
  let cursor = baseStart > today ? baseStart : today;

  while (cursor <= horizonDate) {
    // DAILY
    if (rule.frequency === "daily") {
      const diff = diffDaysUTC(baseStart, cursor);
      if (diff >= 0 && diff % rule.interval === 0) {
        list.push(withSameTimeUTC(cursor, baseStart));
      }
      cursor = addDaysUTC(cursor, 1);
      continue;
    }

    // WEEKLY
    if (rule.frequency === "weekly") {
      const weekday = cursor
        .toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })
        .toLowerCase()
        .slice(0, 3);

      if (!rule.daysOfWeek.length || rule.daysOfWeek.includes(weekday)) {
        list.push(withSameTimeUTC(cursor, baseStart));
      }
      cursor = addDaysUTC(cursor, 1);
      continue;
    }

    cursor = addDaysUTC(cursor, 1);
  }

  return list;
};


// ======================================================
// CREATE REAL EVENT (BOOKABLE)
// ======================================================
const createOccurrence = async (template, startDate, index) => {
  const duration =
    template.schedule.endDateTime -
    template.schedule.startDateTime;

  const newEvent = await Events.create({
    basicInfo: template.basicInfo,
    schedule: {
      type: "oneTime",
      startDateTime: startDate,
      endDateTime: new Date(startDate.getTime() + duration),
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

    // ✅ TIMING SLOTS FIX
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
// REBUILD SLOTS FOR NEW EVENT DATE
// ======================================================
const rebuildSlots = (blocks, newEventStart) => {
  if (!blocks?.length) return [];

  const baseDay = startOfDayUTC(blocks[0].date);
  const newBaseDay = startOfDayUTC(newEventStart);

  return blocks.map(block => {
    const offset = diffDaysUTC(baseDay, startOfDayUTC(block.date));
    const newBlockDay = addDaysUTC(newBaseDay, offset);

    return {
      date: newBlockDay,
      timeSlots: block.timeSlots.map(slot => ({
        quantity: slot.quantity,
        startTime: mergeDateAndTimeUTC(newBlockDay, slot.startTime),
        endTime: mergeDateAndTimeUTC(newBlockDay, slot.endTime),
      })),
    };
  });
};


// ======================================================
// EXPORT
// ======================================================
module.exports = {
  runRecurringEventsCron,
};
