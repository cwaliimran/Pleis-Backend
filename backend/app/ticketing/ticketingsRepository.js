const { getWithFilters } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");

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

const getMinTicketPricesByEventIds = async (eventIds = []) => {
  if (!eventIds.length) return {};

  const prices = await TicketingsModel.aggregate([
    {
      $match: {
        event: { $in: eventIds },
        status: "active",
        price: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$event",
        minPrice: { $min: "$price" },
      },
    },
  ]);

  // Convert to map { eventId: price }
  return prices.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.minPrice;
    return acc;
  }, {});
};

module.exports = {
  getTicketingsWithFilters,
  getMinTicketPricesByEventIds,
};
