const { convertUtcToTimezone } = require("@utils/responseUtil");

function formatTicketing(timezone, item) {
  if (!item) return null;

  const obj =
    typeof item.toObject === "function" ? item.toObject() : item;

  //
  // ----- TICKET LEVEL -----
  //
  const original = obj.quantity ?? 0;
  const remaining =
    typeof obj.remainingQuantity === "number"
      ? obj.remainingQuantity
      : original;

  obj.originalQuantity = original;
  obj.quantity = remaining;
  obj.soldOut = remaining === 0;

  //
  // ----- SLOT LEVEL -----
  //
  if (obj.timingSlots?.dateTimeSlots?.length) {
    obj.timingSlots.dateTimeSlots = obj.timingSlots.dateTimeSlots.map(
      (dateBlock) => {
        const formattedDate = dateBlock.date
          ? convertUtcToTimezone(dateBlock.date, timezone, "YYYY-MM-DD")
          : "";

        const timeSlots = (dateBlock.timeSlots || []).map((slot) => {
          const slotOriginal = slot.quantity ?? 0;

          // treat slot.remainingQuantity ONLY internally
          const slotRemaining =
            typeof slot.remainingQuantity === "number"
              ? slot.remainingQuantity
              : slotOriginal;

          return {
            ...slot,
            originalQuantity: slotOriginal,
            quantity: slotRemaining,     // <-- remaining now lives here
            soldOut: slotRemaining === 0,

            startTime: slot.startTime
              ? convertUtcToTimezone(slot.startTime, timezone, "hh:mm A")
              : "",
            endTime: slot.endTime
              ? convertUtcToTimezone(slot.endTime, timezone, "hh:mm A")
              : ""
          };
        });

        return {
          ...dateBlock,
          date: formattedDate,
          timeSlots
        };
      }
    );
  }

  //
  // REMOVE backend-only meta fields
  //
  delete obj.remainingQuantity;
  if (obj.timingSlots?.dateTimeSlots) {
    obj.timingSlots.dateTimeSlots.forEach((d) =>
      d.timeSlots?.forEach((s) => {
        delete s.remainingQuantity;
      })
    );
  }

  return obj;
}

module.exports = { formatTicketing };
