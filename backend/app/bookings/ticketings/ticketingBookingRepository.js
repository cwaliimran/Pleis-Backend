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
    {
      $lookup: {
        from: "events",
        let: { eventId: "$ticket.snapshot.event" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$eventId"] } } },
          { $project: { _id: 1, "basicInfo.title": 1, "basicInfo.media": 1, "basicInfo.venueLocation": 1, schedule: 1 } }
        ],
        as: "ticketEvent"
      }
    },
    {
      $addFields: {
        "ticket.snapshot.event": { $arrayElemAt: ["$ticketEvent", 0] }
      }
    },
    // --- companyOrganizer lookup ---
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

    { $project: { ticketEvent: 0, organizationPopulated: 0 } },
    { $sort: options.sort || { createdAt: -1 } },
    { $skip: options.skip || 0 },
    { $limit: options.limit || 10 }
  ]);
};


const getTicketingBookingById = async (id) => {

  const result = await TicketingBookings.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // Populate organization with only required fields
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

    // Populate order with only paymentDetails
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
            },
          },
        ],
        as: "order",
      },
    },
    { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },

    // Populate event inside snapshot
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
              "schedule": 1,
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

  if (!result[0]) {
    return null;
  }

  return result[0];
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
  getTicketingBookingForTransfer
};