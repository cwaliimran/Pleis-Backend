// services/topPromoService.js
const { convertUtcToTimezone } = require("@utils/responseUtil");
const TopPromos = require("./TopPromos");
const topPromoRepo = require("./topPromosRepository");
const mongoose = require("mongoose");
const { formatMoreFromOrganizerEventResponse } = require("../../../app/events/formatter/recommendedEventFormatter");

const createTopPromo = async ({ event, isTop10, status }) => {
  return await topPromoRepo.createTopPromo({ event, isTop10, status });
};

const getTopPromos = async ({ page, limit, keyword, status, date, orderSort = "asc", }) => {
  const filters = [];

  if (date) {
    filters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) filters.push({ status });
  else filters.push({ status: { $ne: "deleted" } });

  if (keyword) {
    filters.push({
      $or: [{ event: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = filters.length ? { $and: filters } : {};
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [topPromos, getTopPromosCounts] = await Promise.all([
    topPromoRepo.getTopPromosWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    topPromoRepo.getTopPromosCounts(query),
  ]);

  const { totalFiltered, total, active, inactive } = getTopPromosCounts;
  return {
    topPromos,
    meta: {
      page,
      limit,
      total: totalFiltered,
      topPromosCount: { total, active, inactive },
    },
  };

};

const getTop10Promos = async ({ userLocation, timezone, filters }) => {
  const topPromos = await topPromoRepo.getTop10Promos(filters, timezone);
  const processed = topPromos.map(doc => {
    return formatMoreFromOrganizerEventResponse(doc.event, { userLocation, timezone });

  });

  return processed;
};



const updateTopPromo = async (id, data) => {
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.isTop10 !== undefined && { isTop10: data.isTop10 }),
  };

  if (Object.keys(updateData).length === 0) {
    const topPromo = await topPromoRepo.findTopPromoById(id);
    return topPromo;
  }

  const updated = await topPromoRepo.findTopPromoByIdAndUpdate(id, updateData);
  return updated;
};

const deleteTopPromo = async (id) => {
  const updated = await topPromoRepo.findTopPromoByIdAndUpdate(id, { status: "deleted" });
  if (!updated) return null;
  await topPromoRepo.normalizeOrders();
  return true;
};



const reorderTopPromo = async (movedId, previousOrder,
  newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await TopPromos.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await TopPromos.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await TopPromos.findByIdAndUpdate(movedId, { order: newOrder }, { session });
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
  createTopPromo,
  getTopPromos,
  updateTopPromo,
  deleteTopPromo,
  reorderTopPromo,
  getTop10Promos,
};