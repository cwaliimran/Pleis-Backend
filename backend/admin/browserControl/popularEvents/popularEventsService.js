// services/popularEventService.js
const PopularEvents = require("./PopularEvents");
const popularEventRepo = require("./popularEventsRepository");
const mongoose = require("mongoose");

const createPopularEvent = async ({ event, isTop10, status }) => {
  return await popularEventRepo.createPopularEvent({ event, isTop10, status });
};

const getPopularEvents = async ({ page, limit, keyword, status, date, orderSort = "asc", }) => {
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

  let [popularEvents, getPopularEventsCounts] = await Promise.all([
    popularEventRepo.getPopularEventsWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    popularEventRepo.getPopularEventsCounts(query),
  ]);

  const { totalFiltered, total, active, inactive } = getPopularEventsCounts;
  return {
    popularEvents,
    meta: {
      page,
      limit,
      total: totalFiltered,
      popularEventsCount: { total, active, inactive },
    },
  };

};

const updatePopularEvent = async (id, data) => {
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.isTop10 !== undefined && { isTop10: data.isTop10 }),
  };

  if (Object.keys(updateData).length === 0) {
    const popularEvent = await popularEventRepo.findPopularEventById(id);
    return popularEvent;
  }

  const updated = await popularEventRepo.findPopularEventByIdAndUpdate(id, updateData);
  return updated;
};

const deletePopularEvent = async (id) => {
  const updated = await popularEventRepo.findPopularEventByIdAndUpdate(id, { status: "deleted" });
  if (!updated) return null;
  await popularEventRepo.normalizeOrders();
  return true;
};



const reorderPopularEvent = async (movedId, previousOrder,
  newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await PopularEvents.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await PopularEvents.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await PopularEvents.findByIdAndUpdate(movedId, { order: newOrder }, { session });
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
  createPopularEvent,
  getPopularEvents,
  updatePopularEvent,
  deletePopularEvent,
  reorderPopularEvent,
};