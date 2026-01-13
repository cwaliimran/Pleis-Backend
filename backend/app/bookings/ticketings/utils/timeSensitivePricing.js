function resolveTimeSensitivePricing(ticket, now) {
  const { timeSensitivePricing } = ticket;

  if (!timeSensitivePricing) {
    return {
      phase: "regular",
      price: ticket.price,
    };
  }

  const { earlyBird, lastMinute } = timeSensitivePricing;

  // Early bird (highest priority)
  if (
    earlyBird?.endDate &&
    now <= new Date(earlyBird.endDate) &&
    earlyBird.discountedPrice > 0
  ) {
    return {
      phase: "earlyBird",
      price: earlyBird.discountedPrice,
    };
  }

  // Last minute
  if (
    lastMinute?.startDate &&
    now >= new Date(lastMinute.startDate) &&
    lastMinute.discountedPrice > 0
  ) {
    return {
      phase: "lastMinute",
      price: lastMinute.discountedPrice,
    };
  }

  return {
    phase: "regular",
    price: ticket.price,
  };
}

module.exports = { resolveTimeSensitivePricing };
