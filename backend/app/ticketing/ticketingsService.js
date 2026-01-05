const { formatTicketing } = require("./fomatter/formatTicketing");
const ticketingRepo = require("./ticketingsRepository");


const getTicketings = async ({ timezone, eventId }) => {

  let ticketings = await ticketingRepo.getAvailableTicketings(eventId, timezone);

  // Attach availability first
  ticketings = await Promise.all(
    ticketings.map(t => ticketingRepo.attachAvailabilityToTicket(t))
  );

  ticketings = ticketings.map((item) => formatTicketing(timezone, item));


  return ticketings;
};

module.exports = {
  getTicketings,
};
