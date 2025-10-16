// services/topPromoService.js
const TopPromos = require("./TopPromos");
const topPromoRepo = require("./topPromosRepository");
const mongoose = require("mongoose");

const createTopPromo = async ({ event, status }) => {
  return await topPromoRepo.createTopPromo({ event, status });
};

const getTopPromos = async ({ page, limit, keyword, status, date, orderSort = "asc" }) => {
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


  const [topPromos, totalFiltered, total, active, inactive] = await Promise.all([
    topPromoRepo.getTopPromosWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    topPromoRepo.countTopPromos(query),
    topPromoRepo.countTopPromos({ status: { $ne: "deleted" } }),
    topPromoRepo.countTopPromos({ status: "active" }),
    topPromoRepo.countTopPromos({ status: "inactive" }),
  ]);

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



const updateTopPromo = async (id, data) => {
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const topPromo = await topPromoRepo.findTopPromoById(id).populate('event');
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
};