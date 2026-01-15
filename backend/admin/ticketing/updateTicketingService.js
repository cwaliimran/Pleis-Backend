/**
 * updateTicketingService.js
 *
 * Modes:
 *  - single  -> updates ONLY this ticket
 *  - future  -> updates this + all future + template
 *
 * GUARANTEES:
 *  - Dates are NEVER shifted in future mode
 *  - Only time-of-day propagates forward
 */

const Ticketings = require("@TicketingsModel");

// ======================================================
// HELPERS
// ======================================================
const startOfDayUTC = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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

/**
 * Rebuild timing slots by:
 *  - keeping the ORIGINAL date of the occurrence
 *  - applying ONLY the time-of-day from payload
 */
const rebuildSlotsForOccurrence = (existingSlots, payloadSlots) => {
  if (!existingSlots?.length || !payloadSlots?.length) return existingSlots;

  const sourceBlock = payloadSlots[0]; // structure source
  const sourceSlots = sourceBlock.timeSlots;

  return existingSlots.map(block => {
    const blockDay = startOfDayUTC(new Date(block.date));

    return {
      date: blockDay,
      timeSlots: sourceSlots.map(slot => ({
        quantity: slot.quantity,
        startTime: mergeDateAndTimeUTC(blockDay, new Date(slot.startTime)),
        endTime: mergeDateAndTimeUTC(blockDay, new Date(slot.endTime)),
      })),
    };
  });
};

// ======================================================
// FIELD APPLIER
// ======================================================
const applyFields = (doc, data, options = { futureMode: false }) => {

  if (data.title !== undefined) doc.title = data.title.trim();
  if (data.quantity !== undefined) doc.quantity = data.quantity;
  if (data.price !== undefined) doc.price = data.price;
  if (data.taxPercentage !== undefined) doc.taxPercentage = data.taxPercentage;

  if (data.event !== undefined) doc.event = data.event;

  // ------------------------------
  // TIMING SLOTS (CRITICAL FIX)
  // ------------------------------
  if (data.timingSlots) {
    if (!doc.timingSlots)
      doc.timingSlots = { enabled: false, dateTimeSlots: [] };

    if (data.timingSlots.enabled !== undefined)
      doc.timingSlots.enabled = data.timingSlots.enabled;

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {

      if (options.futureMode && doc.timingSlots.dateTimeSlots?.length) {
        // 🔒 FUTURE MODE → TIME ONLY
        doc.timingSlots.dateTimeSlots = rebuildSlotsForOccurrence(
          doc.timingSlots.dateTimeSlots,
          data.timingSlots.dateTimeSlots
        );
      } else {
        // SINGLE MODE OR TEMPLATE
        doc.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
      }
    }
  }

  // ------------------------------
  // REPEATABLE
  // ------------------------------
  if (data.repeatable) {
    if (!doc.repeatable)
      doc.repeatable = { isRepeatable: false, visits: 1 };

    if (data.repeatable.isRepeatable !== undefined)
      doc.repeatable.isRepeatable = data.repeatable.isRepeatable;

    if (data.repeatable.visits !== undefined)
      doc.repeatable.visits = data.repeatable.visits;
  }

  // ------------------------------
  // TIME SENSITIVE PRICING
  // ------------------------------
  if (data.timeSensitivePricing) {
    if (!doc.timeSensitivePricing)
      doc.timeSensitivePricing = { earlyBird: {}, lastMinute: {} };

    const { earlyBird, lastMinute } = data.timeSensitivePricing;

    if (earlyBird) {
      if (earlyBird.endDate !== undefined)
        doc.timeSensitivePricing.earlyBird.endDate = earlyBird.endDate;
      if (earlyBird.discountedPrice !== undefined)
        doc.timeSensitivePricing.earlyBird.discountedPrice = earlyBird.discountedPrice;
    }

    if (lastMinute) {
      if (lastMinute.startDate !== undefined)
        doc.timeSensitivePricing.lastMinute.startDate = lastMinute.startDate;
      if (lastMinute.discountedPrice !== undefined)
        doc.timeSensitivePricing.lastMinute.discountedPrice = lastMinute.discountedPrice;
    }
  }

  // ------------------------------
  // FAST TRACK
  // ------------------------------
  if (data.fastTrackEntry) {
    if (!doc.fastTrackEntry)
      doc.fastTrackEntry = { enabled: false, quantity: 0, extraPrice: 0 };

    if (data.fastTrackEntry.enabled !== undefined)
      doc.fastTrackEntry.enabled = data.fastTrackEntry.enabled;
    if (data.fastTrackEntry.quantity !== undefined)
      doc.fastTrackEntry.quantity = data.fastTrackEntry.quantity;
    if (data.fastTrackEntry.extraPrice !== undefined)
      doc.fastTrackEntry.extraPrice = data.fastTrackEntry.extraPrice;
  }

  // ------------------------------
  // RESERVATION
  // ------------------------------
  if (data.requiresReservation) {
    if (!doc.requiresReservation)
      doc.requiresReservation = { enabled: false, type: "any" };

    if (data.requiresReservation.enabled !== undefined)
      doc.requiresReservation.enabled = data.requiresReservation.enabled;
    if (data.requiresReservation.type !== undefined)
      doc.requiresReservation.type = data.requiresReservation.type;
  }

  if (data.status !== undefined) doc.status = data.status;
  if (data.scheduledPublishAt !== undefined)
    doc.scheduledPublishAt = data.scheduledPublishAt;
};

// ======================================================
// MAIN SERVICE
// ======================================================
const updateTicketingService = async (ticketId, payload, mode = "single") => {
  console.log("🎟 updateTicketingService:start", { ticketId, mode,payload });

  const ticket = await Ticketings.findById(ticketId);
  if (!ticket) return null;

  const isChild = !!ticket?.recurringMeta?.parentTicket;

  // ------------------------------
  // SINGLE MODE
  // ------------------------------
  if (mode === "single" || !isChild) {
    applyFields(ticket, payload);
    await ticket.save();
    return ticket;
  }

  // ------------------------------
  // FUTURE MODE
  // ------------------------------
  const parentId = ticket.recurringMeta.parentTicket;
  const template = await Ticketings.findById(parentId);
  if (!template) return null;

  // 1️⃣ CURRENT OCCURRENCE
  applyFields(ticket, payload, { futureMode: true });
  await ticket.save();

  // 2️⃣ TEMPLATE
  applyFields(template, payload);
  await template.save();

  // 3️⃣ FUTURE OCCURRENCES
  const futureTickets = await Ticketings.find({
    "recurringMeta.parentTicket": parentId,
    "recurringMeta.occurrenceIndex": { $gt: ticket.recurringMeta.occurrenceIndex },
    status: { $ne: "deleted" },
  }).sort({ "recurringMeta.occurrenceIndex": 1 });

  for (const occ of futureTickets) {
    applyFields(occ, payload, { futureMode: true });
    await occ.save();
  }

  return true;
};

module.exports = {
  updateTicketingService,
};
