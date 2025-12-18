const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const GlobalQr = require("@GlobalQrModel");
const QrRepo = require("./qrRepository");
const { generateMeta } = require("@utils/responseUtil");
// const formatQr = require("../../../commonModules/loyalty/Qrs/formatters/formatQr");
const { default: mongoose } = require("mongoose");

const createQr = async (data) => {
  let Qr = await QrRepo.createQr(data);
  return Qr;
};

const getQrs = async ({  page, limit, keyword, status, date, timezone }) => {
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
    GlobalQr.countDocuments({  status: { $ne: "deleted" } }),
    GlobalQr.countDocuments({ status: "active" }),
    GlobalQr.countDocuments({ status: "inactive" }),
    GlobalQr.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.QrsCount = { total, active, inactive };
  const formattedQrs = Qrs.map(Qr => formatQr(Qr, timezone));

  return { Qrs: formattedQrs, meta };
};



const deleteQr = async (id) => {
  const updated = await QrRepo.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};



module.exports = {
  createQr,
  getQrs,
  deleteQr,
};