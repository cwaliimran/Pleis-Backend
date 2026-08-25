const { MenuItemsCombos } = require("@MenuItemsCombosModel");
const MenuItems = require("@MenuItemsModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");

const normalizeTitle = (title = "") => String(title).trim().toLowerCase();

const getComboItemTitleOptions = (item = {}) => {
  const nestedTitle =
    item?.menuItem && typeof item.menuItem === "object"
      ? item.menuItem.title
      : undefined;

  return [
    ...new Set(
      [item?.title, nestedTitle]
        .map((title) => normalizeTitle(title))
        .filter(Boolean),
    ),
  ];
};

const menuItemsWithV2FieldsPipeline = [
  {
    $lookup: {
      from: "dayparts",
      localField: "daypart",
      foreignField: "_id",
      as: "daypart",
      pipeline: [
        {
          $project: {
            name: 1,
            code: 1,
            status: 1,
            startTime: 1,
            endTime: 1,
            isAllDay: 1,
          },
        },
      ],
    },
  },
  {
    $lookup: {
      from: "allergens",
      localField: "allergens",
      foreignField: "_id",
      as: "allergens",
      pipeline: [{ $project: { name: 1, code: 1, status: 1 } }],
    },
  },
  {
    $lookup: {
      from: "menus",
      localField: "menu",
      foreignField: "_id",
      as: "menu",
      pipeline: [{ $project: { title: 1, status: 1 } }],
    },
  },
  {
    $unwind: {
      path: "$menu",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $project: {
      title: 1,
      status: 1,
      basePrice: 1,
      image: 1,
      daypart: 1,
      allergens: 1,
      availableDays: 1,
      menu: 1,
      creator: 1,
    },
  },
];

const populateComboLookups = [
  {
    path: "subCategory",
    select: "title status",
  },
  {
    path: "menuItems.menuItem",
    select: "title status basePrice image daypart allergens menu creator",
    populate: [
      {
        path: "daypart",
        select: "name code status startTime endTime isAllDay",
      },
      {
        path: "allergens",
        select: "name code status",
      },
      {
        path: "menu",
        select: "title status creator organization",
      },
    ],
  },
];

const comboLookupStages = [
  {
    $lookup: {
      from: "menusubcategories",
      localField: "subCategory",
      foreignField: "_id",
      as: "subCategory",
      pipeline: [{ $project: { title: 1, status: 1 } }],
    },
  },
  {
    $unwind: {
      path: "$subCategory",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "menuitems",
      localField: "menuItems.menuItem",
      foreignField: "_id",
      as: "_menuItemDocs",
      pipeline: [
        ...menuItemsWithV2FieldsPipeline,
        { $project: { title: 1, menu: 1, basePrice: 1 } },
      ],
    },
  },
  {
    $addFields: {
      menuItems: {
        $map: {
          input: "$menuItems",
          as: "mi",
          in: {
            quantity: "$$mi.quantity",
            menuItem: {
              $first: {
                $filter: {
                  input: "$_menuItemDocs",
                  cond: { $eq: ["$$this._id", "$$mi.menuItem"] },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    $project: { _menuItemDocs: 0 },
  },
];

/**
 * A combo can appear in a menu when:
 *  - combo.creator (companyOrganizer) owns the menu item and the menu
 *  - that menu has standalone items matching EVERY combo component title
 */
const attachApplicableMenus = async (combos = []) => {

  if (!combos.length) {
    return combos;
  }

  const plainCombos = combos.map((combo) =>
    typeof combo.toObject === "function" ? combo.toObject() : combo,
  );

  const requiredTitlesByCombo = plainCombos.map((combo) => {
    const rawMenuItems = combo.menuItems || [];

    const titlesPerItem = rawMenuItems
      .map((item) => getComboItemTitleOptions(item))
      .filter((titles) => titles.length);

    return titlesPerItem;
  });

  const allTitles = [...new Set(requiredTitlesByCombo.flat(2))];

  if (!allTitles.length) {
    return plainCombos.map((combo) => ({
      ...combo,
      applicableMenus: [],
    }));
  }

  const creatorIds = [
    ...new Set(
      plainCombos
        .map((combo) => combo.creator?.toString?.() || combo.creator)
        .filter(Boolean)
        .map(String),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  if (!creatorIds.length) {
    return plainCombos.map((combo) => ({
      ...combo,
      applicableMenus: [],
    }));
  }

  const titleMatchers = allTitles.map(
    (title) =>
      new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  );

  const matchingItems = await MenuItems.aggregate([
    {
      $match: {
        status: { $ne: "deleted" },
        $or: titleMatchers.map((regex) => ({ title: regex })),
      },
    },
    {
      $lookup: {
        from: "menus",
        localField: "menu",
        foreignField: "_id",
        as: "menu",
        pipeline: [
          {
            $match: {
              status: { $ne: "deleted" },
            },
          },
          {
            $lookup: {
              from: "organizations",
              localField: "organization",
              foreignField: "_id",
              as: "organization",
              pipeline: [
                {
                  $match: {
                    status: { $ne: "deleted" },
                    creator: { $in: creatorIds },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    creator: 1,
                  },
                },
              ],
            },
          },
          { $unwind: "$organization" },
          {
            $project: {
              title: 1,
              status: 1,
              organization: 1,
              creator: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$menu" },
    {
      $match: {
        $expr: {
          $in: ["$menu.organization.creator", creatorIds],
        },
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        basePrice: 1,
        status: 1,
        creator: 1,
        menu: 1,
        normalizedTitle: {
          $toLower: {
            $trim: {
              input: "$title",
            },
          },
        },
      },
    },
  ]);

  const menuIndex = new Map();

  for (const item of matchingItems) {
    const menuId = item.menu?._id?.toString?.() || item.menu?._id;
    const menuCreatorId =
      item.menu?.organization?.creator?.toString?.() ||
      item.menu?.creator?.toString?.() ||
      item.creator?.toString?.();
    const creatorId = menuCreatorId || item.creator?.toString?.();
    const key = `${creatorId}:${menuId}`;

    if (!menuId || !creatorId) {
      continue;
    }

    if (!menuIndex.has(key)) {
      menuIndex.set(key, {
        menu: item.menu,
        creatorId,
        titles: new Set(),
        itemsByTitle: new Map(),
      });
    }

    const entry = menuIndex.get(key);
    const normalized = item.normalizedTitle;

    entry.titles.add(normalized);

    if (!entry.itemsByTitle.has(normalized)) {
      entry.itemsByTitle.set(normalized, []);
    }

    entry.itemsByTitle.get(normalized).push({
      _id: item._id,
      title: item.title,
      basePrice: item.basePrice,
      status: item.status,
    });
  }

  const result = plainCombos.map((combo, index) => {
    const requiredTitles = requiredTitlesByCombo[index];

    const creatorId = (
      combo.creator?.toString?.() ||
      combo.creator ||
      ""
    ).toString();

    if (!requiredTitles.length || !creatorId) {
      return {
        ...combo,
        applicableMenus: [],
      };
    }

    const applicableMenus = [];

    for (const [, entry] of menuIndex) {
      if (entry.creatorId !== creatorId) {
        continue;
      }

      const missingTitles = requiredTitles.filter((titleOptions) => {
        const found = titleOptions.some((title) => entry.titles.has(title));
        return !found;
      });

      const hasAllComponents = missingTitles.length === 0;

      if (!hasAllComponents) {
        continue;
      }

      applicableMenus.push({
        _id: entry.menu._id,
        title: entry.menu.title,
        status: entry.menu.status,
      });
    }

    return {
      ...combo,
      applicableMenus,
    };
  });

  return result;
};

const createMenuItemsCombo = async (data) => {
  const combo = new MenuItemsCombos(data);
  await combo.save();
  return combo;
};

const getMenuItemsCombos = async ({
  page,
  limit,
  keyword,
  status,
  subCategory,
  priceMode,
  date,
  skip,
  sortBy,
  sortOrder,
  creator,
}) => {
  const pipeline = [];

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (subCategory) {
    pipeline.push({
      $match: { subCategory: new mongoose.Types.ObjectId(subCategory) },
    });
  }

  if (priceMode) {
    pipeline.push({ $match: { priceMode } });
  }

  if (creator) {
    pipeline.push({
      $match: { creator: new mongoose.Types.ObjectId(creator) },
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
      [{ schema: MenuItemsCombos.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push(...comboLookupStages);

  if (sortBy && sortOrder) {
    const sortField =
      sortBy === "name"
        ? "name"
        : sortBy === "price"
          ? "price"
          : sortBy === "priceMode"
            ? "priceMode"
            : sortBy === "subCategory"
              ? "subCategory.title"
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

  const result = await MenuItemsCombos.aggregate(pipeline);
  const combos = await attachApplicableMenus(result[0]?.data || []);
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const baseFilter = {
    ...(creator && { creator: new mongoose.Types.ObjectId(creator) }),
    status: { $ne: "deleted" },
  };

  const [total, active, inactive, notOrderable] = await Promise.all([
    MenuItemsCombos.countDocuments(baseFilter),
    MenuItemsCombos.countDocuments({ ...baseFilter, status: "active" }),
    MenuItemsCombos.countDocuments({ ...baseFilter, status: "inactive" }),
    MenuItemsCombos.countDocuments({ ...baseFilter, status: "notOrderable" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.combosCount = { total, active, inactive, notOrderable };

  return { combos, meta };
};

const findMenuItemsComboById = async (id) => {
  return MenuItemsCombos.findById(id).populate(populateComboLookups);
};

const findMenuItemsComboByIdWithMenus = async (id) => {
  const combo = await findMenuItemsComboById(id);
  if (!combo) return null;
  const [enriched] = await attachApplicableMenus([combo]);
  return enriched;
};

const findByIdAndUpdate = async (id, data) => {
  return MenuItemsCombos.findByIdAndUpdate(id, data, { new: true }).populate(
    populateComboLookups,
  );
};

module.exports = {
  createMenuItemsCombo,
  getMenuItemsCombos,
  findMenuItemsComboById,
  findMenuItemsComboByIdWithMenus,
  findByIdAndUpdate,
  attachApplicableMenus,
};
