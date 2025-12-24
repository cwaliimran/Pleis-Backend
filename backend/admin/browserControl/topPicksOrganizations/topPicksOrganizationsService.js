// services/topPicksOrganizationService.js
const { formatTopPicks } = require("./formatters/topPicksFormatter");
const TopPicksOrganizations = require("@TopPicksOrganizationsModel");
const topPicksOrganizationRepo = require("./topPicksOrganizationsRepository");
const mongoose = require("mongoose");

const createTopPicksOrganization = async ({ organization, isTop10, status }) => {
  return await topPicksOrganizationRepo.createTopPicksOrganization({ organization, isTop10, status });
};

const getTopPicksOrganizations = async ({ page, limit, keyword, status, date, orderSort = "asc", }) => {
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
      $or: [{ organization: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = filters.length ? { $and: filters } : {};
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [topPicksOrganizations, getTopPicksOrganizationsCounts] = await Promise.all([
    topPicksOrganizationRepo.getTopPicksOrganizationsWithFilters(query, skip, limit === 0 ? 0 : limit, sort),
    topPicksOrganizationRepo.getTopPicksOrganizationsCounts(query),
  ]);

  const { totalFiltered, total, active, inactive } = getTopPicksOrganizationsCounts;

  let formattedTopPicksOrganizations = formatTopPicks(topPicksOrganizations);

  return {
    topPicksOrganizations: formattedTopPicksOrganizations,
    meta: {
      page,
      limit,
      total: totalFiltered,
      topPicksOrganizationsCount: { total, active, inactive },
    },
  };

};

const updateTopPicksOrganization = async (id, data) => {
  const updateData = {
    ...(data.status !== undefined && { status: data.status }),
    ...(data.isTop10 !== undefined && { isTop10: data.isTop10 }),
  };

  if (Object.keys(updateData).length === 0) {
    const topPicksOrganization = await topPicksOrganizationRepo.findTopPicksOrganizationById(id);
    return topPicksOrganization;
  }

  const updated = await topPicksOrganizationRepo.findTopPicksOrganizationByIdAndUpdate(id, updateData);
  return updated;
};

const deleteTopPicksOrganization = async (id) => {
  const updated = await topPicksOrganizationRepo.findTopPicksOrganizationByIdAndUpdate(id, { status: "deleted" });
  if (!updated) return null;
  await topPicksOrganizationRepo.normalizeOrders();
  return true;
};



const reorderTopPicksOrganization = async (movedId, previousOrder,
  newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (previousOrder > newOrder) {
      await TopPicksOrganizations.updateMany(
        { order: { $gte: newOrder, $lt: previousOrder } },
        { $inc: { order: 1 } },
        { session }
      );
    } else {
      await TopPicksOrganizations.updateMany(
        { order: { $gt: previousOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
        { session }
      );
    }

    await TopPicksOrganizations.findByIdAndUpdate(movedId, { order: newOrder }, { session });
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
  createTopPicksOrganization,
  getTopPicksOrganizations,
  updateTopPicksOrganization,
  deleteTopPicksOrganization,
  reorderTopPicksOrganization,
};