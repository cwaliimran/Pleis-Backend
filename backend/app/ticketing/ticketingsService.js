const { resolveTimeSensitivePricing } = require("../bookings/ticketings/utils/timeSensitivePricing");
const { formatTicketing } = require("./fomatter/formatTicketing");
const ticketingRepo = require("./ticketingsRepository");
const { getCurrentDateInTimezone } = require("@utils/responseUtil");


const getTicketings = async ({ timezone, eventId }) => {
  const now = getCurrentDateInTimezone({ timezone });

  let ticketings = await ticketingRepo.getAvailableTicketings(eventId, timezone);

  // Attach availability
  ticketings = await Promise.all(
    ticketings.map(t => ticketingRepo.attachAvailabilityToTicket(t))
  );

  // Apply pricing resolution
  ticketings = ticketings.map(ticket => {
    const pricing = resolveTimeSensitivePricing(ticket, now);
    return {
      ...ticket,
      pricing: {
        phase: pricing.phase,
        unitPrice: pricing.basePrice,
        originalPrice: ticket.price,
      },
    };
  });

  // Final formatting
  return ticketings.map(item => formatTicketing(timezone, item));
};

module.exports = {
  getTicketings,
};
