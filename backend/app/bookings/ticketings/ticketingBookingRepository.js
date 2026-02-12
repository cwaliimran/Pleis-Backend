const { TicketingBookings } = require("@TicketingBookingsModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");

const createTicketingBooking = async (data) => {
  const ticketingBooking = new TicketingBookings(data);
  return ticketingBooking.save();
};

const getTicketingBookings = async (query = {}, options = {}) => {
  return TicketingBookings.aggregate([
    { $match: query },

    // --- Event lookup ---
    {
      $lookup: {
        from: "events",
        let: { eventId: "$ticket.snapshot.event" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$eventId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
              "basicInfo.media": 1,
              "basicInfo.venueLocation": 1,
              schedule: 1,
            }
          }
        ],
        as: "ticketEvent"
      }
    },
    {
      $addFields: {
        "ticket.snapshot.event": { $arrayElemAt: ["$ticketEvent", 0] }
      }
    },

    // --- Organization lookup ---
    {
      $lookup: {
        from: "organizations",
        let: { organizationId: "$organization" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$organizationId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media.logo": 1,
            }
          }
        ],
        as: "organizationPopulated"
      }
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organizationPopulated", 0] }
      }
    },

    // --- Order lookup (payment details) ---
    {
      $lookup: {
        from: "ticketingorders",
        let: { orderId: "$order" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orderId"] } } },
          {
            $project: {
              _id: 1,
              paymentDetails: 1,
              status: 1,
            }
          }
        ],
        as: "orderPopulated"
      }
    },
    {
      $addFields: {
        order: { $arrayElemAt: ["$orderPopulated", 0] }
      }
    },

    // --- Cleanup ---
    {
      $project: {
        ticketEvent: 0,
        organizationPopulated: 0,
        orderPopulated: 0,
      }
    },

    { $sort: options.sort || { createdAt: -1 } },
    { $skip: options.skip || 0 },
    { $limit: options.limit || 10 },
  ]);
};


const getTicketingBookingById = async (id) => {
  const bookingId = new mongoose.Types.ObjectId(id);

  const result = await TicketingBookings.aggregate([
    // 1️⃣ Match booking
    { $match: { _id: bookingId } },

    // 2️⃣ Populate organization
    {
      $lookup: {
        from: "organizations",
        let: { orgId: "$organization" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media": 1,
            },
          },
        ],
        as: "organization",
      },
    },
    { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },

    // 3️⃣ Populate ticketing order FIRST
    {
      $lookup: {
        from: "ticketingorders",
        let: { orderId: "$order" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orderId"] } } },
          {
            $project: {
              _id: 1,
              orderPricing: 1,
              paymentDetails: 1,
              createdAt: 1,
              isFastTrack: 1,
              pricingPhase: 1,
            },
          },
        ],
        as: "order",
      },
    },

    { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },

    // 4️⃣ Lookup unified wallet transactions USING order._id
    {
      $lookup: {
        from: "unifiedwallettransactions",
        let: { orderId: "$order._id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$entityId", "$$orderId"] },
            },
          },
          {
            $project: {
              walletType: 1,
              points: "$points.total",
            },
          },
        ],
        as: "transactions",
      },
    },

    // 5️⃣ Convert transactions array → object
    {
      $addFields: {
        transactions: {
          $arrayToObject: {
            $map: {
              input: "$transactions",
              as: "tx",
              in: {
                k: "$$tx.walletType",
                v: {
                  points: "$$tx.points",
                },
              },
            },
          },
        },
      },
    },

    // 6️⃣ Populate event inside ticket snapshot
    {
      $lookup: {
        from: "events",
        let: { eventId: "$ticket.snapshot.event" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$eventId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
              "basicInfo.media": 1,
              "basicInfo.venueLocation": 1,
              schedule: 1,
            },
          },
        ],
        as: "ticketEvent",
      },
    },
    {
      $addFields: {
        "ticket.snapshot.event": { $arrayElemAt: ["$ticketEvent", 0] },
      },
    },
    { $project: { ticketEvent: 0 } },
  ]);

  return result[0] || null;
};




const getTicketingBookingForTransfer = async (id) => {
  return TicketingBookings.findById(id)
    .select("_id user transferHistory")
};




const updateTicketingBooking = async (id, data) => {
  return TicketingBookings.findByIdAndUpdate(id, data, { new: true })
    .populate('organization')
    .populate('user')
    .populate('tickets.ticketId');
};

const deleteTicketingBooking = async (id) => {
  return TicketingBookings.findByIdAndDelete(id);
};

//findTagByIdAndUpdate
const findTagByIdAndUpdate = async (id, data) => {
  return TicketingBookings.findByIdAndUpdate(id, data, { new: true })
    .populate('organization')
    .populate('user')
    .populate('tickets.ticketId');
};

const getTicketingBookingsCount = async (query) => {
  return getModelCounts({
    model: TicketingBookings, filterQuery: query, statusMap: {
      status: ["valid", "cancelled", "used"]
    }
  });
}

const createManyTicketBookings = async (ticketingBookings, session = null) => {
  return TicketingBookings.insertMany(ticketingBookings, { session });
};


module.exports = {
  createTicketingBooking,
  getTicketingBookings,
  getTicketingBookingById,
  updateTicketingBooking,
  deleteTicketingBooking,
  findTagByIdAndUpdate,
  getTicketingBookingsCount,
  createManyTicketBookings,
  getTicketingBookingForTransfer,
};