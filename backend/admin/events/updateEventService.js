/**
 * updateEventService.js
 *
 * Modes:
 *  - single  -> only current event
 *  - future  -> current + all future, template updated, history preserved
 */

const { Events } = require("@EventsModel");
const { uniqueObjectIds } = require("../../helperUtils/responseUtil");
const {
  syncMapMarker,
  firstImageFilename,
  toBlobName,
} = require("../../helperUtils/mapMarkerImage");

const updateEventService = async (eventId, payload, mode = "single") => {

  const event = await Events.findById(eventId);
  if (!event) {

    return null;
  }


  const isChild = !!event?.recurringMeta?.parentEvent;

  // -----------------------------
  // SAFE FIELD APPLIER
  // -----------------------------
  const applyFields = async (doc, data, skipSchedule = false) => {
    const prevMedia = doc.basicInfo?.media
      ? {
          name: doc.basicInfo.media.name,
          logoMarker: doc.basicInfo.media.logoMarker,
          type: doc.basicInfo.media.type,
        }
      : null;

    if (data.basicInfo) {
      for (const key of Object.keys(data.basicInfo)) {
        doc.basicInfo[key] = data.basicInfo[key];
      }
    }

    if (data.basicInfo?.categories) {
      doc.basicInfo.categories = uniqueObjectIds(
        data.basicInfo.categories
      );
    }

    if (data.basicInfo?.tags) {
      doc.basicInfo.tags = uniqueObjectIds(
        data.basicInfo.tags
      );
    }

    // Map marker from first image when media changes
    if (data.basicInfo?.media) {
      const media = doc.basicInfo.media || {};
      const mediaType = media.type || "image";
      if (mediaType === "video") {
        media.logoMarker = await syncMapMarker({
          newSource: "",
          prevSource: prevMedia?.name || "",
          prevMarker: prevMedia?.logoMarker || "",
        });
      } else if (data.basicInfo.media.name !== undefined) {
        const first = firstImageFilename(media.name) || "";
        const prevFirst = firstImageFilename(prevMedia?.name) || "";
        if (toBlobName(first) !== toBlobName(prevFirst) || !media.logoMarker) {
          media.logoMarker = await syncMapMarker({
            newSource: first,
            prevSource: prevFirst,
            prevMarker: prevMedia?.logoMarker || "",
          });
        }
      }
      doc.basicInfo.media = media;
    }

    if (!skipSchedule && data.schedule) {
      doc.schedule = { ...doc.schedule, ...data.schedule };
    }

    if (data.preOrdersEnabled !== undefined)
      doc.preOrdersEnabled = data.preOrdersEnabled;

    if (data.basicInfo?.status !== undefined)
      doc.status = data.basicInfo.status;
    if (data.feedbackEnabled !== undefined)
      doc.feedbackEnabled = data.feedbackEnabled;

    // recurringDetails may change too
    if (data.schedule?.recurringDetails) {
      doc.schedule.recurringDetails = {
        ...doc.schedule.recurringDetails,
        ...data.schedule.recurringDetails,
      };
    }
  };

  // ================================================
  // NON-RECURRING OR SINGLE MODE
  // ================================================
  if (mode === "single" || !isChild) {


    await applyFields(event, payload);
    await event.save();


    return event;
  }

  // ================================================
  // FUTURE MODE
  // ================================================



  const parentId = event.recurringMeta.parentEvent;
  const template = await Events.findById(parentId);

  if (!template) {

    return null;
  }

  const rule = template.schedule.recurringDetails;

  // -------------------------------------------
  // STEP 1 — UPDATE THE CURRENT OCCURRENCE
  // -------------------------------------------


  await applyFields(event, payload);

  const editedStart = new Date(payload.schedule.startDateTime);
  const editedEnd = new Date(payload.schedule.endDateTime);
  const editedDuration = editedEnd - editedStart;

  event.schedule.startDateTime = editedStart;
  event.schedule.endDateTime = editedEnd;

  await event.save();



  // -------------------------------------------
  // STEP 2 — UPDATE TEMPLATE TO MATCH CURRENT
  // -------------------------------------------


  await applyFields(template, payload, true);

  template.schedule.startDateTime = new Date(editedStart);
  template.schedule.endDateTime = new Date(editedEnd);

  await template.save();



  // -------------------------------------------
  // STEP 3 — FETCH STRICTLY FUTURE OCCURRENCES
  // -------------------------------------------
  const futureOccurrences = await Events.find({
    "recurringMeta.parentEvent": parentId,
    "schedule.startDateTime": { $gt: editedStart },
    status: { $ne: "deleted" }
  }).sort({ "recurringMeta.occurrenceIndex": 1 });



  // -------------------------------------------
  // STEP 4 — REBUILD FUTURE DATES BASED ON ANCHOR
  // -------------------------------------------
  let anchorDate = new Date(editedStart);
  let anchorIndex = event.recurringMeta.occurrenceIndex;

  for (const occ of futureOccurrences) {
    anchorIndex++;

    const newDate = computeNextDate(anchorDate, rule);

    occ.schedule.startDateTime = new Date(
      Date.UTC(
        newDate.getUTCFullYear(),
        newDate.getUTCMonth(),
        newDate.getUTCDate(),
        editedStart.getUTCHours(),
        editedStart.getUTCMinutes()
      )
    );

    occ.schedule.endDateTime = new Date(
      occ.schedule.startDateTime.getTime() + editedDuration
    );

    await applyFields(occ, payload, true);

    await occ.save();


    anchorDate = newDate;
  }

  return true;
};

// ===================================================================
// COMPUTE NEXT DATE FROM ANCHOR (NOT FROM ORIGINAL TEMPLATE)
// ===================================================================
function computeNextDate(date, rule) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (!rule?.isEnabled) return date;

  const d = new Date(date);

  if (rule.frequency === "daily") {
    d.setUTCDate(d.getUTCDate() + rule.interval);
    return d;
  }

  if (rule.frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + rule.interval * 7);
    return d;
  }

  if (rule.frequency === "monthly") {
    const baseDay = d.getUTCDate();

    d.setUTCMonth(d.getUTCMonth() + rule.interval);

    const lastDay = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
    ).getUTCDate();

    d.setUTCDate(Math.min(baseDay, lastDay));

    return d;
  }

  return d;
}

module.exports = {
  updateEventService,
};
