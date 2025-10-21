// services/pinnedContentService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const PinnedContent = require("./PinnedContent");
const pinnedContentRepo = require("./pinnedContentRepository");
const mongoose = require("mongoose");

const createPinnedContent = async ({ type, object, status }) => {
  return await pinnedContentRepo.createPinnedContent({ type, object, status });
};

const getPinnedContent = async ({ page, limit, keyword, status, date, orderSort = "asc" }) => {
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

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const sort = { order: orderSort === "desc" ? -1 : 1 };

  const [pinnedContent, getPinnedContentCounts] = await Promise.all([
    pinnedContentRepo.getPinnedContentWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    pinnedContentRepo.getPinnedContentCounts(query),
  ]);
  const { totalFiltered, total, active, inactive } =  getPinnedContentCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.pinnedContentCount = { total, active, inactive };

  return { pinnedContent, meta };
};

const updatePinnedContent = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.object !== undefined && { object: data.object }),
    ...(data.type !== undefined && { type: data.type }),
  };

  if (Object.keys(updateData).length === 0) {
    const pinnedContent = await pinnedContentRepo.findPinnedContentById(id);
    return pinnedContent;
  }

  const updated = await pinnedContentRepo.findByIdAndUpdate(id, updateData, { new: true });
  return updated;
};

const deletePinnedContent = async (id) => {
  const updated = await pinnedContentRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  await pinnedContentRepo.normalizeOrders();

  return true;
};

const reorderPinnedContent = async (movedId, previousOrder, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await PinnedContent.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await PinnedContent.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await PinnedContent.findByIdAndUpdate(movedId, { order: newOrder }, { session });
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
  return await pinnedContentRepo.countPinnedContent(condition);
};


module.exports = {
  createPinnedContent,
  getPinnedContent,
  updatePinnedContent,
  deletePinnedContent,
  reorderPinnedContent,
  countItemsByFilter,
};