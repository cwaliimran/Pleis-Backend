const { TicketingBookings } = require("@TicketingBookingsModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

const createTicketingBooking = async (data) => {
  const ticketingBooking = new TicketingBookings(data);
  return ticketingBooking.save();
};

const getTicketingBookings = async (query = {}, options = {}) => {
  return TicketingBookings.find(query)
    .populate('organization', 'basicInfo.name')
    .sort(options.sort || { createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 10);
};

const getTicketingBookingById = async (id) => {
  return TicketingBookings.findById(id)
    .populate('organization', 'basicInfo.name')
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
      status: ["pending", "confirmed", "cancelled", "completed"]
    }
  });
}

const createManyTicketBookings = async (ticketingBookings) => {
  return TicketingBookings.insertMany(ticketingBookings);
}

module.exports = {
  createTicketingBooking,
  getTicketingBookings,
  getTicketingBookingById,
  updateTicketingBooking,
  deleteTicketingBooking,
  findTagByIdAndUpdate,
  getTicketingBookingsCount,
  createManyTicketBookings
};