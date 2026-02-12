function resolveTimeSensitivePricing(ticket, now) {
  const { timeSensitivePricing, fastTrackEntry } = ticket;

  let phase = "regular";
  let basePrice = ticket.price;

  if (timeSensitivePricing) {
    const { earlyBird, lastMinute } = timeSensitivePricing;

    // Early bird has priority
    if (
      earlyBird?.endDate &&
      now <= new Date(earlyBird.endDate) &&
      earlyBird.discountedPrice > 0
    ) {
      phase = "earlyBird";
      basePrice = earlyBird.discountedPrice;
    }
    // Last minute
    else if (
      lastMinute?.startDate &&
      now >= new Date(lastMinute.startDate) &&
      lastMinute.discountedPrice > 0
    ) {
      phase = "lastMinute";
      basePrice = lastMinute.discountedPrice;
    }
  }

  const fastTrackAvailable =
    fastTrackEntry?.enabled === true &&
    fastTrackEntry.quantity > 0 &&
    fastTrackEntry.extraPrice > 0;

  return {
    phase,
    basePrice,
    fastTrack: {
      available: fastTrackAvailable,
      extraPrice: fastTrackAvailable
        ? fastTrackEntry.extraPrice
        : 0,
    },
  };
}

module.exports = { resolveTimeSensitivePricing };
