const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
// const GlobalQr = require("@GlobalQrModel");
const QrRepo = require("./qrRepository");
const { generateMeta } = require("@utils/responseUtil");
// const formatQr = require("../../../commonModules/loyalty/Qrs/formatters/formatQr");
const { default: mongoose } = require("mongoose");

const createQr = async (data) => {
  let Qr = await QrRepo.createQr(data);
  return Qr;
};

const getQrs = async ({ companyOrganizer, page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {

  };
  if (status) query.status = status;
  else query.status = { $ne: "deleted" };
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  if (keyword) {
    Object.assign(query, buildKeywordQueryFromModels([{ schema: Qr.schema }], keyword));
  }

  // Get Qrs with population
  const Qrs = await QrRepo.getQrsWithFilters(query, skip, limit);

  // Get counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    GlobalQr.countDocuments({ ...(companyOrganizer && { companyOrganizer }), status: { $ne: "deleted" } }),
    GlobalQr.countDocuments({ status: "active", ...(companyOrganizer && { companyOrganizer }) }),
    GlobalQr.countDocuments({ status: "inactive", ...(companyOrganizer && { companyOrganizer }) }),
    GlobalQr.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.QrsCount = { total, active, inactive };
  const formattedQrs = Qrs.map(Qr => formatQr(Qr, timezone));

  return { Qrs: formattedQrs, meta };
};

const updateQr = async (id, data) => {
  const Qr = await QrRepo.findQrById(id);
  if (!Qr) return null;
  Object.assign(Qr, data);
  await Qr.save();

  return formatQr(Qr.toObject());
};

const deleteQr = async (id) => {
  const updated = await QrRepo.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getQrDetails = async (id) => {
  return await QrRepo.findQrById(id);
};
const getTicketings = async ({ timezone, page, limit, keyword, status, date, eventId }) => {
  const andConditions = [];

  if (eventId) {
    andConditions.push({ event: eventId });
  }

  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = andConditions.length ? { $and: andConditions } : {};

  const [ticketings, counts] = await Promise.all([
    ticketingRepo.getTicketingsWithFilters(query, page, limit),
    ticketingRepo.getCounts(query),
  ]);

  const formattedTicketings = ticketings.map((item) => formatTicketing(timezone, item));
  const { totalFiltered, total, active, inactive } = counts;

  const meta = {
    ...generateMeta(page, limit, totalFiltered),
    ticketingsCount: { total, active, inactive },
  };

  return { ticketings: formattedTicketings, meta };
};
module.exports = {
  createQr,
  getQrs,
  updateQr,
  getQrDetails,
  deleteQr,
  getTicketings,
};