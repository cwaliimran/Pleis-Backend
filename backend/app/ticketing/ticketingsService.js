const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatTicketing } = require("./fomatter/formatTicketing");
const ticketingRepo = require("./ticketingsRepository");


const getTicketings = async ({ timezone, eventId }) => {

  const query = { event: eventId, status: { $eq: "active" } };

  let [ticketings] = await Promise.all([
    ticketingRepo.getTicketingsWithFilters(query),
  ]);

  ticketings = ticketings.map((item) => formatTicketing(timezone, item));


  return ticketings;
};

module.exports = {
  getTicketings,
};
