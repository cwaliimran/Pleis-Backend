// services/statusBadgeService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const StatusBadges = require("./StatusBadges");
const statusBadgeRepo = require("./statusBadgesRepository");
const mongoose = require("mongoose");
const { formatStatusBadges, formatStatusBadge } = require("./formatters/statusBadgesFormatter");

const createStatusBadge = async ({ image, backgroundImage, title, status, entryPoints, retainPoints, order }) => {
  let badge = await statusBadgeRepo.createStatusBadge({ image, backgroundImage, title, status, entryPoints, retainPoints, order });
  return formatStatusBadge(badge);
};

const getStatusBadges = async ({ page, limit, keyword, status, date, orderSort = "asc" }) => {
  const query = {};

  //Filter by status
  query.status = status ? status : { $ne: "deleted" };

  //Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  //Keyword search
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [statusBadges, counts] = await Promise.all([
    statusBadgeRepo.getStatusBadgesWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    statusBadgeRepo.getRecordsCountByStatus(query),
  ]);

  const { totalFiltered, total, active, inactive } = counts;

  const meta = generateMeta(page, limit, totalFiltered);
  meta.statusBadgesCount = { total, active, inactive };

  statusBadges = formatStatusBadges(statusBadges);

  return { statusBadges, meta };
};

const updateStatusBadge = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.backgroundImage !== undefined && { backgroundImage: data.backgroundImage }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.entryPoints !== undefined && { entryPoints: data.entryPoints }),
    ...(data.retainPoints !== undefined && { retainPoints: data.retainPoints }),
    ...(data.order !== undefined && { order: data.order }),
  };

  if (Object.keys(updateData).length === 0) {
    const statusBadge = await statusBadgeRepo.findStatusBadgeById(id);
    return statusBadge;
  }

  const updated = await statusBadgeRepo.findByIdAndUpdate(id, updateData);
  return formatStatusBadge(updated);
};

const deleteStatusBadge = async (id) => {
  const updated = await statusBadgeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await statusBadgeRepo.normalizeOrders();

  return true;
};

const reorderStatusBadge = async (movedId, previousOrder, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await StatusBadges.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await StatusBadges.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await StatusBadges.findByIdAndUpdate(movedId, { order: newOrder }, { session });
    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

module.exports = {
  createStatusBadge,
  getStatusBadges,
  updateStatusBadge,
  deleteStatusBadge,
  reorderStatusBadge,
};