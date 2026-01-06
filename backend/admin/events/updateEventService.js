const { Events } = require("@EventsModel");

/**
 * UPDATE EVENT (single | future)
 *
 * "single"  -> only update selected event
 * "future"  -> keep same recurrence anchors, only shift time & fields
 */

const updateEventService = async (eventId, payload, mode = "single") => {
  const event = await Events.findById(eventId);
  if (!event) return null;

  const isChild = !!event?.recurringMeta?.parentEvent;

  const applyFields = (doc, data, skipSchedule = false) => {
    if (data.basicInfo) {
      doc.basicInfo = { ...doc.basicInfo, ...data.basicInfo };
    }

    if (!skipSchedule && data.schedule) {
      doc.schedule = { ...doc.schedule, ...data.schedule };
    }

    if (data.preOrdersEnabled !== undefined)
      doc.preOrdersEnabled = data.preOrdersEnabled;

    if (data.status !== undefined)
      doc.status = data.status;
  };

  // SINGLE EVENT MODE
  if (mode === "single" || !isChild) {
    applyFields(event, payload);
    await event.save();
    return event;
  }

  // =========================
  // FUTURE MODE
  // =========================

  const parentId = event.recurringMeta.parentEvent;
  const template = await Events.findById(parentId);
  if (!template) return null;

  // ⛔ capture the ORIGINAL base before editing template
  const originalBaseStart = new Date(template.schedule.startDateTime);
  const originalBaseEnd = new Date(template.schedule.endDateTime);
  const durationMs = originalBaseEnd - originalBaseStart;

  const rule = template.schedule.recurringDetails;

  // apply update to template EXCEPT schedule dates (we recompute)
  applyFields(template, payload, true);
  await template.save();

  // determine new time-of-day window from CURRENT event payload
  const newStartTime = new Date(payload.schedule.startDateTime);
  const newEndTime = new Date(payload.schedule.endDateTime);

  const newTimeDeltaStart =
    newStartTime.getUTCHours() * 3600000 +
    newStartTime.getUTCMinutes() * 60000;

  const newTimeDeltaEnd =
    newEndTime.getUTCHours() * 3600000 +
    newEndTime.getUTCMinutes() * 60000;

  // fetch current & future
  const occurrences = await Events.find({
    "recurringMeta.parentEvent": parentId,
    "schedule.startDateTime": { $gte: event.schedule.startDateTime },
    status: { $ne: "deleted" }
  });

  for (const occ of occurrences) {
    const idx = occ.recurringMeta.occurrenceIndex;

    // anchor: original pattern
    const anchoredDate = computeAnchoredDate(originalBaseStart, rule, idx);

    // attach new time-of-day only
    occ.schedule.startDateTime = new Date(
      Date.UTC(
        anchoredDate.getUTCFullYear(),
        anchoredDate.getUTCMonth(),
        anchoredDate.getUTCDate(),
        newStartTime.getUTCHours(),
        newStartTime.getUTCMinutes()
      )
    );

    occ.schedule.endDateTime = new Date(
      occ.schedule.startDateTime.getTime() + (newEndTime - newStartTime)
    );

    applyFields(occ, payload, true);

    await occ.save();
  }

  return true;
};


// ========================================================
// ANCHORED RECURRENCE
// keeps original calendar positioning
// ========================================================
function computeAnchoredDate(base, rule, index) {
  if (!rule?.isEnabled) return base;

  if (rule.frequency === "daily") {
    return new Date(
      base.getTime() +
        (index - 1) *
          rule.interval *
          24 *
          60 *
          60 *
          1000
    );
  }

  if (rule.frequency === "weekly") {
    return new Date(
      base.getTime() +
        (index - 1) *
          rule.interval *
          7 *
          24 *
          60 *
          60 *
          1000
    );
  }

  return base;
}

module.exports = {
  updateEventService
};
