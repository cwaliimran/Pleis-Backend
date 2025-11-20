const { generateMeta } = require("@utils/responseUtil");
const transactionsRepo = require("./transactionsRepository");
const { formatTransaction } = require("./formatters/transactionsFormatter");


const getTransactionsService = async ({ page = 1, limit = 10, keyword, status = "confirmed", date, orderSort = "asc", timezone = "UTC", userId }) => {
  const query = {};

  // Status filter
  query.status = status ? status : { $ne: "deleted" };
  if (userId) {
    query.user = userId;
  }

  // Date filter (createdAt)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Keyword search (name or description)
  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  // Pagination
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Sorting (by createdAt)
  const sort = { createdAt: orderSort === "desc" ? -1 : 1 };

  let statusMap = { status: ["pending", "confirmed", "cancelled", "completed"] };
  // Fetch ticketingBookings and total count concurrently
  let [ticketingBookings, counts] = await Promise.all([
    transactionsRepo.getTransactionsRepo(query, { skip, limit: limit === 0 ? 0 : limit, sort }),
    transactionsRepo.getCounts(query, statusMap)
  ]);

  // Format ticketingBookings
  ticketingBookings = ticketingBookings.map((ticketingBooking) => formatTransaction(ticketingBooking, { timezone }));
  let { pending, confirmed, cancelled, completed, total, totalFiltered } = counts;
  // Meta info
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { pending, confirmed, cancelled, completed, total };

  return { ticketingBookings, meta };
};

module.exports = {
  getTransactionsService,
};