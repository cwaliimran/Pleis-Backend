const { convertUtcToTimezone } = require("@utils/responseUtil");

function formatTicketing(timezone, item) {
  if (!item) return null;

  const obj =
    typeof item.toObject === "function" ? item.toObject() : item;

  /* =========================
     PRICING (RESOLVED)
  ========================== */
  if (obj.pricing) {
    obj.price = obj.pricing.unitPrice;
    obj.originalPrice = obj.pricing.originalPrice;
    obj.pricingPhase = obj.pricing.phase;
    delete obj.pricing;
  } else {
    obj.originalPrice = obj.price;
    obj.pricingPhase = "regular";
  }

  /* =========================
     TIME-SENSITIVE PRICING
  ========================== */
  if (obj.timeSensitivePricing) {
    const { earlyBird, lastMinute } = obj.timeSensitivePricing;

    if (earlyBird?.endDate) {
      earlyBird.endDate = convertUtcToTimezone(
        earlyBird.endDate,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }

    if (lastMinute?.startDate) {
      lastMinute.startDate = convertUtcToTimezone(
        lastMinute.startDate,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }
  }

  if (obj.scheduledPublishAt) {
    obj.scheduledPublishAt = convertUtcToTimezone(
      obj.scheduledPublishAt,
      timezone,
      "YYYY-MM-DD hh:mm A"
    );
  }

  /* =========================
     AVAILABILITY (FIXED)
  ========================== */
  let soldOut = false;
  let displayQuantity = 0;

  if (obj.timingSlots?.enabled && obj.timingSlots?.dateTimeSlots?.length) {
    const allSlots = obj.timingSlots.dateTimeSlots.flatMap(
      d => d.timeSlots || []
    );

    const remainingSlots = allSlots.filter(
      s => (s.remainingQuantity ?? s.quantity ?? 0) > 0
    );

    soldOut = remainingSlots.length === 0;
    displayQuantity = remainingSlots.reduce(
      (sum, s) => sum + (s.remainingQuantity ?? s.quantity ?? 0),
      0
    );
  } else {
    const original = obj.quantity ?? 0;
    const remaining =
      typeof obj.remainingQuantity === "number"
        ? obj.remainingQuantity
        : original;

    soldOut = remaining === 0;
    displayQuantity = remaining;
  }

  obj.quantity = displayQuantity;
  obj.soldOut = soldOut;

  /* =========================
     SLOT LEVEL FORMATTING
  ========================== */
  if (obj.timingSlots?.dateTimeSlots?.length) {
    obj.timingSlots.dateTimeSlots = obj.timingSlots.dateTimeSlots.map(
      (dateBlock) => {
        const formattedDate = dateBlock.date
          ? convertUtcToTimezone(dateBlock.date, timezone, "YYYY-MM-DD")
          : "";

        const timeSlots = (dateBlock.timeSlots || []).map((slot) => {
          const slotOriginal = slot.quantity ?? 0;
          const slotRemaining =
            typeof slot.remainingQuantity === "number"
              ? slot.remainingQuantity
              : slotOriginal;

          return {
            ...slot,
            originalQuantity: slotOriginal,
            quantity: slotRemaining,
            soldOut: slotRemaining === 0,
            startTime: slot.startTime
              ? convertUtcToTimezone(slot.startTime, timezone, "hh:mm A")
              : "",
            endTime: slot.endTime
              ? convertUtcToTimezone(slot.endTime, timezone, "hh:mm A")
              : "",
          };
        });

        return {
          ...dateBlock,
          date: formattedDate,
          timeSlots,
        };
      }
    );
  }

  /* =========================
     CLEANUP INTERNAL FIELDS
  ========================== */
  delete obj.remainingQuantity;

  // ----- FAST TRACK -----
  if (obj.fastTrackEntry?.enabled) {
    const original = obj.fastTrackEntry.quantity ?? 0;
    const remaining =
      typeof obj.fastTrackEntry.remainingQuantity === "number"
        ? obj.fastTrackEntry.remainingQuantity
        : original;

    obj.fastTrackEntry.originalQuantity = original;
    obj.fastTrackEntry.quantity = remaining;
    obj.fastTrackEntry.soldOut = remaining === 0;

    delete obj.fastTrackEntry.remainingQuantity;
  }


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
