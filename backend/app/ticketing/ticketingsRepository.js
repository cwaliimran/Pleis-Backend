const { getWithFilters } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { default: mongoose } = require("mongoose");

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


const getAvailableTicketings = async (eventId, timezone) => {
  // Ensure a real JS Date
  const now = getCurrentDateInTimezone({ timezone });

  // Ensure ObjectId
  const eventObjectId =
    typeof eventId === "string"
      ? new mongoose.Types.ObjectId(eventId)
      : eventId;

  return TicketingsModel.aggregate([
    {
      $match: {
        event: eventObjectId,
        status: "active",
        // scheduled publish guard
        $or: [
          { scheduledPublishAt: null },
          { scheduledPublishAt: { $lte: now } }
        ]
      },
    },

    // Keep only future/ongoing time slots when timing slots are enabled
    {
      $addFields: {
        "timingSlots.dateTimeSlots": {
          $map: {
            input: "$timingSlots.dateTimeSlots",
            as: "d",
            in: {
              date: "$$d.date",
              timeSlots: {
                $filter: {
                  input: "$$d.timeSlots",
                  as: "t",
                  cond: {
                    $or: [
                      { $eq: ["$$t.endTime", null] },
                      { $gte: ["$$t.endTime", now] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },

    // Return only tickets that actually have at least one valid time slot
    {
      $match: {
        $or: [
          // normal tickets (no timing slots)
          { "timingSlots.enabled": false },

          // timing-slot-based tickets with at least one valid slot
          {
            $and: [
              { "timingSlots.enabled": true },
              {
                $expr: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$timingSlots.dateTimeSlots",
                          as: "d",
                          cond: { $gt: [{ $size: "$$d.timeSlots" }, 0] },
                        },
                      },
                    },
                    0,
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  ]);
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

  /* ---------------- GLOBAL TICKET AVAILABILITY ---------------- */
  const totalBooked = await TicketingBookings.countDocuments({
    "ticket.ticketId": t._id,
    status: { $in: ["valid", "used"] }
  });

  // For timing-slot tickets, capacity is sum of all slot quantities
  // For regular tickets, capacity is the top-level quantity
  const totalCapacity = (t.timingSlots?.enabled && Array.isArray(t.timingSlots?.dateTimeSlots))
    ? t.timingSlots.dateTimeSlots.reduce(
      (dateAcc, dateSlot) => dateAcc + (dateSlot.timeSlots || []).reduce(
        (slotAcc, slot) => slotAcc + (slot.quantity || 0),
        0
      ),
      0
    )
    : (t.quantity || 0);

  t.remainingQuantity = Math.max(totalCapacity - totalBooked, 0);

  /* ---------------- SLOT AVAILABILITY ---------------- */
  if (t.timingSlots?.enabled && Array.isArray(t.timingSlots.dateTimeSlots)) {
    for (const dateSlot of t.timingSlots.dateTimeSlots) {
      for (const slot of dateSlot.timeSlots || []) {
        const slotBooked = await TicketingBookings.countDocuments({
          "ticket.ticketId": t._id,
          "ticket.timeSlot": slot._id.toString(),
          status: { $in: ["valid", "used"] }
        });

        slot.remainingQuantity = Math.max(
          (slot.quantity || 0) - slotBooked,
          0
        );
      }
    }
  }

  /* ---------------- FAST TRACK ---------------- */
  if (t.fastTrackEntry?.enabled) {
    const fastTrackBooked = await TicketingBookings.countDocuments({
      "ticket.ticketId": t._id,
      $or: [
        { isFastTrack: true },
        { "ticket.snapshot.fastTrack": true },
      ],
      status: { $in: ["valid", "used"] }
    });

    t.fastTrackEntry.remainingQuantity = Math.max(
      t.fastTrackEntry.quantity - fastTrackBooked,
      0
    );
  }
  return t;
}



module.exports = {
  getTicketingsWithFilters,
  getMinTicketPricesByEventIds,
  attachAvailabilityToTicket,
  getAvailableTicketings
};
