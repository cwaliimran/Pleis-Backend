const {
  MenuItemsDiscounts,
} = require("@MenuItemsDiscountsModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");

const syncExpiredDiscounts = async () => {
  await MenuItemsDiscounts.updateMany(
    {
      status: "active",
      endDate: { $lt: new Date() },
    },
    { $set: { status: "expired" } },
  );
};

const createMenuItemsDiscount = async (data) => {
  const discount = new MenuItemsDiscounts(data);
  await discount.save();
  return discount;
};

const getMenuItemsDiscounts = async ({
  page,
  limit,
  keyword,
  status,
  type,
  companyOrganizer,
  date,
  skip,
  sortBy,
  sortOrder,
}) => {
  await syncExpiredDiscounts();

  const pipeline = [];

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (type) {
    pipeline.push({ $match: { type } });
  }

  if (companyOrganizer) {
    pipeline.push({
      $match: {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      },
    });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: MenuItemsDiscounts.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

pipeline.push({
  $lookup: {
    from: "menuitems",
    localField: "menuItems",
    foreignField: "_id",
    as: "menuItems",
    pipeline: [
      { $project: { title: 1, status: 1, menu: 1 } },
      {
        $lookup: {
          from: "menus",
          localField: "menu",
          foreignField: "_id",
          as: "menu",
          pipeline: [{ $project: { title: 1 } }],
        },
      },
      { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
    ],
  },
});

  if (sortBy && sortOrder) {
    const sortField =
      sortBy === "name"
        ? "name"
        : sortBy === "type"
          ? "type"
          : sortBy === "value"
            ? "value"
            : sortBy === "startDate"
              ? "startDate"
              : sortBy === "endDate"
                ? "endDate"
                : sortBy === "status"
                  ? "status"
                  : sortBy === "createdAt"
                    ? "createdAt"
                    : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    pipeline.push({ $sort: { [sortField]: sortDirection } });
  } else {
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await MenuItemsDiscounts.aggregate(pipeline);
  const discounts = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const baseFilter = {
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }),
    status: { $ne: "deleted" },
  };

  const [total, active, inactive, expired] = await Promise.all([
    MenuItemsDiscounts.countDocuments(baseFilter),
    MenuItemsDiscounts.countDocuments({ ...baseFilter, status: "active" }),
    MenuItemsDiscounts.countDocuments({ ...baseFilter, status: "inactive" }),
    MenuItemsDiscounts.countDocuments({ ...baseFilter, status: "expired" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.discountsCount = { total, active, inactive, expired };

  return { discounts, meta };
};

const findMenuItemsDiscountById = async (id) => {
  await syncExpiredDiscounts();

  return MenuItemsDiscounts.findById(id).populate({
    path: "menuItems",
    select: "title status basePrice",
  });
};

const findByIdAndUpdate = async (id, data) => {
  return MenuItemsDiscounts.findByIdAndUpdate(id, data, { new: true }).populate({
    path: "menuItems",
    select: "title status basePrice",
  });
};

const findOverlappingActiveDiscounts = async ({
  menuItemIds = [],
  startDate,
  endDate,
  excludeDiscountId = null,
}) => {
  if (!menuItemIds.length) return [];

  const objectIds = menuItemIds.map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const query = {
    status: "active",
    menuItems: { $in: objectIds },
    startDate: { $lt: new Date(endDate) },
    endDate: { $gt: new Date(startDate) },
  };

  if (excludeDiscountId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeDiscountId) };
  }

  return MenuItemsDiscounts.find(query)
    .select("name type value startDate endDate menuItems status createdAt")
    .lean();
};

module.exports = {
  createMenuItemsDiscount,
  getMenuItemsDiscounts,
  findMenuItemsDiscountById,
  findByIdAndUpdate,
  findOverlappingActiveDiscounts,
  syncExpiredDiscounts,
};
