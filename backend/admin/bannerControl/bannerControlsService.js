// services/bannerControlsService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const BannerControls = require("./BannerControls");
const bannerControlsRepo = require("./bannerControlsRepository");
const mongoose = require("mongoose");
const { formatBannerObject } = require("./fomatter/formatBannerObject");

const createBannerControls = async ({ title, image, type, object, status,description }) => {
  return await bannerControlsRepo.createBannerControls({ title, image, type, object, status, description });
};

const getBannerControls = async ({ page, limit, keyword, status, date, orderSort = "asc",category }) => {
  const query = {};
  // Filter by status
  query.status = status ? status : { $ne: "deleted" };

  // Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }


  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [bannerControls, getBannerControlsCounts] = await Promise.all([
    bannerControlsRepo.getBannerControlsWithFilters(query, page, limit === 0 ? 0 : limit, sort),
    bannerControlsRepo.getBannerControlsCounts(query),
  ]);

  //format bannerControls
  bannerControls = bannerControls.map(item => {
    return formatBannerObject(item);
  });

  const { totalFiltered, total, active, inactive } = getBannerControlsCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.bannerControlsCount = { total, active, inactive };

  return { bannerControls, meta };
};

const updateBannerControls = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.object !== undefined && { object: data.object }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.description !== undefined && { description: data.description }),
  };

  if (Object.keys(updateData).length === 0) {
    const bannerControls = await bannerControlsRepo.findBannerControlsById(id);
    return bannerControls;
  }

  const updated = await bannerControlsRepo.findByIdAndUpdate(id, updateData, { new: true });
  return updated;
};

const deleteBannerControls = async (id) => {
  const updated = await bannerControlsRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await bannerControlsRepo.normalizeOrders();

  return true;
};

const reorderBannerControls = async (movedId, previousOrder, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await BannerControls.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await BannerControls.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await BannerControls.findByIdAndUpdate(movedId, { order: newOrder }, { session });
    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

const countItemsByFilter = async (condition) => {
  return await bannerControlsRepo.countBannerControls(condition);
};

module.exports = {
  createBannerControls,
  getBannerControls,
  updateBannerControls,
  deleteBannerControls,
  reorderBannerControls,
  countItemsByFilter,
};