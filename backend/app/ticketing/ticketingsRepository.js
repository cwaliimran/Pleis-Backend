const { getWithFilters } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");

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


async function attachAvailabilityToTicket(ticket) {
  const t = ticket.toObject ? ticket.toObject() : { ...ticket };

  // preserve organizer-defined capacity
  t.originalQuantity = t.quantity;

  const totalBooked = await TicketingBookings.countDocuments({
    "ticket.ticketId": t._id,
  });

  const remainingGlobal = Math.max(t.quantity - totalBooked, 0);

  t.remainingQuantity = remainingGlobal;

  if (t.timingSlots?.enabled && Array.isArray(t.timingSlots.dateTimeSlots)) {
    for (const dateSlot of t.timingSlots.dateTimeSlots) {
      if (!dateSlot.timeSlots) continue;

      for (const slot of dateSlot.timeSlots) {
        const bookedForSlot = await TicketingBookings.countDocuments({
          "ticket.ticketId": t._id,
          "ticket.timeSlot": slot._id.toString(),
        });

        slot.remainingQuantity = Math.max(
          (slot.quantity || 0) - bookedForSlot,
          0
        );
      }
    }
  }

  return t;
}


module.exports = {
  getTicketingsWithFilters,
  getMinTicketPricesByEventIds,
  attachAvailabilityToTicket,
};
