const { getWithFilters } = require("@dbUtils/queryUtil");
const TicketingsModel = require("../../admin/ticketing/TicketingsModel");

// Get all with filters (e.g. filter by eventId)
const getTicketingsWithFilters = async (query) => {
  return getWithFilters({
    model: TicketingsModel,
    query,
    options: {
      //select: { title: 1, price: 1, status: 1, event: 1},
    },
  });
};


module.exports = {
  getTicketingsWithFilters,

};
