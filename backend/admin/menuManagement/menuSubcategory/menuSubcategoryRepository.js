const MenuSubcategory = require("@MenuSubcategoryModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const { default: mongoose } = require("mongoose");
const ACTIVE_MenuSubcategoryS_CACHE_KEY = "MenuSubcategory:active";
const buildMenuSubcategorysCacheKey = ({
  page = 1,
  skip = 0,
  limit = 10,
  status,
}) => {
  return `${ACTIVE_MenuSubcategoryS_CACHE_KEY}:page=${page}:skip=${skip}:limit=${limit}:status=${status}`;
};

const buildSiblingFilter = (doc) => ({
  status: { $ne: "deleted" },
  organization: doc.organization || null,
  companyOrganizer: doc.companyOrganizer || null,
});

const createMenuSubcategory = async (data) => {
  try {
    const requestedOrder = Number(data.order);
    const hasManualOrder =
      data.order !== undefined &&
      data.order !== null &&
      data.order !== "" &&
      Number.isFinite(requestedOrder) &&
      requestedOrder > 0;

    if (!hasManualOrder) {
      const last = await MenuSubcategory.findOne(buildSiblingFilter(data))
        .sort({ order: -1 })
        .select("order");
      data.order = last?.order ? last.order + 1 : 1;
    } else {
      data.order = requestedOrder;
    }

    const MenuSubcategoryData = new MenuSubcategory(data);
    await MenuSubcategoryData.save();
    await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);
    return MenuSubcategoryData;
  } catch (err) {
    throw err;
  }
};

// const mongoose = require("mongoose");

const getMenuSubcategorys = async ({
  isNullAllowed,
  timezone,
  page,
  limit,
  keyword,
  status,
  sortBy,
  sortOrder,
  summary,
  organization,
  companyOrganizer,
  skip,
}) => {
  // Query params can arrive as strings
  const nullAllowed = isNullAllowed === true || isNullAllowed === "true";

  /**
   * Build organization/companyOrganizer filter.
   *
   * Rules when nullAllowed = true:
   *
   * organization:
   *   requested organization OR null
   *
   * companyOrganizer:
   *   requested companyOrganizer OR null
   *
   * If both are provided:
   *   (organization = requested OR null)
   *   AND
   *   (companyOrganizer = requested OR null)
   *
   * Therefore this is also allowed:
   *   organization = null
   *   companyOrganizer = null
   */
  const buildScopeFilter = () => {
    const filters = [];

    // Organization filter
    if (organization) {
      const organizationIds = Array.isArray(organization)
        ? organization
        : [organization];

      filters.push(
        nullAllowed
          ? {
              $or: [
                {
                  organization: {
                    $in: organizationIds,
                  },
                },
                {
                  organization: null,
                },
              ],
            }
          : {
              organization: {
                $in: organizationIds,
              },
            },
      );
    }

    // Company Organizer filter
    if (companyOrganizer) {
      const companyOrganizerId =
        companyOrganizer instanceof mongoose.Types.ObjectId
          ? companyOrganizer
          : new mongoose.Types.ObjectId(companyOrganizer);

      filters.push(
        nullAllowed
          ? {
              $or: [
                {
                  companyOrganizer: companyOrganizerId,
                },
                {
                  companyOrganizer: null,
                },
              ],
            }
          : {
              companyOrganizer: companyOrganizerId,
            },
      );
    }

    return filters.length
      ? {
          $and: filters,
        }
      : {};
  };

  // ---------------------------------------------------------
  // Main query
  // ---------------------------------------------------------

  const computeMenuSubcategorys = async () => {
    const pipeline = [];

    // -------------------------------------------------------
    // Status filter
    // -------------------------------------------------------

    if (status) {
      pipeline.push({
        $match: {
          status,
        },
      });
    } else {
      pipeline.push({
        $match: {
          status: {
            $ne: "deleted",
          },
        },
      });
    }

    // -------------------------------------------------------
    // Organization + Company Organizer filter
    // -------------------------------------------------------

    const scopeFilter = buildScopeFilter();

    if (Object.keys(scopeFilter).length) {
      pipeline.push({
        $match: scopeFilter,
      });
    }

    // -------------------------------------------------------
    // Keyword filter
    // -------------------------------------------------------

    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: MenuSubcategory.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({
          $match: keywordMatch,
        });
      }
    }
    // Menu items count lookup
    pipeline.push({
      $lookup: {
        from: "menuitems",
        localField: "_id",
        foreignField: "subCategory",
        pipeline: [{ $count: "count" }],
        as: "menuItemsCount",
      },
    });
    pipeline.push({
      $addFields: {
        menuItemsCount: { $ifNull: [{ $first: "$menuItemsCount.count" }, 0] },
      },
    });

    // -------------------------------------------------------
    // Company Organizer lookup
    // -------------------------------------------------------

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
            },
          },
        ],
        as: "companyOrganizer",
      },
    });

    pipeline.push({
      $addFields: {
        companyOrganizer: {
          $ifNull: [
            {
              $arrayElemAt: ["$companyOrganizer", 0],
            },
            null,
          ],
        },
      },
    });

    // -------------------------------------------------------
    // Organization lookup
    // -------------------------------------------------------

    pipeline.push({
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
            },
          },
        ],
        as: "organization",
      },
    });

    pipeline.push({
      $addFields: {
        organization: {
          $ifNull: [
            {
              $arrayElemAt: ["$organization", 0],
            },
            null,
          ],
        },
      },
    });

    // -------------------------------------------------------
    // Sorting
    // -------------------------------------------------------

    if (sortBy && sortOrder) {
      const sortField =
        sortBy === "title"
          ? "title"
          : sortBy === "status"
            ? "status"
            : sortBy === "createdAt"
              ? "createdAt"
              : sortBy === "organization"
                ? "organization.basicInfo.name"
                : sortBy === "companyOrganizer"
                  ? "companyOrganizer.firstName"
                  : "order";

      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const sortStage = {
        [sortField]: sortDirection,
      };

      pipeline.push({
        $sort: sortStage,
      });
    } else {
      pipeline.push({
        $sort: {
          order: 1,
        },
      });
    }

    // -------------------------------------------------------
    // Pagination + total count
    // -------------------------------------------------------

    pipeline.push({
      $facet: {
        data: [
          {
            $skip: skip,
          },
          ...(limit === 0
            ? []
            : [
                {
                  $limit: limit,
                },
              ]),
        ],

        totalFiltered: [
          {
            $count: "count",
          },
        ],
      },
    });

    // -------------------------------------------------------
    // Execute aggregation
    // -------------------------------------------------------

    const result = await MenuSubcategory.aggregate(pipeline);

    const MenuSubcategorys = result[0]?.data || [];

    const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

    // -------------------------------------------------------
    // Counts
    // -------------------------------------------------------

    const combinedCountFilter = buildScopeFilter();

    const [total, active, inactive] = await Promise.all([
      MenuSubcategory.countDocuments({
        ...combinedCountFilter,
        status: {
          $ne: "deleted",
        },
      }),

      MenuSubcategory.countDocuments({
        ...combinedCountFilter,
        status: "active",
      }),

      MenuSubcategory.countDocuments({
        ...combinedCountFilter,
        status: "inactive",
      }),
    ]);

    // -------------------------------------------------------
    // Meta
    // -------------------------------------------------------

    const meta = generateMeta(page, limit, totalFiltered);

    meta.MenuSubcategorysCount = {
      total,
      active,
      inactive,
    };

    return {
      MenuSubcategorys,
      meta,
    };
  };

  // ---------------------------------------------------------
  // Cache
  // ---------------------------------------------------------

  const isCacheable =
    !companyOrganizer &&
    !organization &&
    !sortBy &&
    !sortOrder &&
    !keyword &&
    !status;

  if (!isCacheable) {
    return computeMenuSubcategorys();
  }

  return cache({
    namespace: ACTIVE_MenuSubcategoryS_CACHE_KEY,

    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },

    ttl: 60,

    fetchFn: computeMenuSubcategorys,
  });
};
const getMenuSubcategorysSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
  organization,
  companyOrganizer,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { order: 1, updatedAt: 1, _id: 1 } });
  if (organization) {
    pipeline.push({
      $match: {
        $or: [{ organization: { $in: organization } }, { organization: null }],
      },
    });
  }
  if (companyOrganizer) {
    const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);
    pipeline.push({
      $match: {
        $or: [
          { companyOrganizer: companyOrganizerId },
          { companyOrganizer: null },
        ],
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await MenuSubcategory.aggregate(pipeline);

  let MenuSubcategorys = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    MenuSubcategory.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    MenuSubcategory.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    MenuSubcategory.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.MenuSubcategorysCount = { total, active, inactive };

  return { MenuSubcategorys, meta };
};

const findMenuSubcategoryById = async (id) => {
  return MenuSubcategory.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);
  return MenuSubcategory.findByIdAndUpdate(id, data, { new: true });
};

const reorderMenuSubCategory = async (movedId, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const moved = await MenuSubcategory.findById(
      new mongoose.Types.ObjectId(movedId),
      null,
      { session },
    );

    if (!moved || moved.status === "deleted") {
      throw new Error("Subcategory not found");
    }

    const siblings = await MenuSubcategory.find(
      buildSiblingFilter(moved),
      { _id: 1, order: 1 },
      { session },
    ).sort({ order: 1, updatedAt: 1, _id: 1 });

    const currentIndex = siblings.findIndex((s) => s._id.equals(moved._id));
    if (currentIndex === -1) throw new Error("Subcategory not found");

    const [item] = siblings.splice(currentIndex, 1);
    const targetIndex = Math.max(
      0,
      Math.min(Math.round(Number(newOrder)) - 1, siblings.length),
    );
    siblings.splice(targetIndex, 0, item);

    const now = new Date();
    const ops = siblings
      .map((doc, i) => ({ doc, order: i + 1 }))
      .filter(({ doc, order }) => doc.order !== order)
      .map(({ doc, order }) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { order, updatedAt: now } },
        },
      }));

    if (ops.length) {
      await MenuSubcategory.bulkWrite(ops, { session });
    }

    await session.commitTransaction();
    session.endSession();
    await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);

    moved.order = targetIndex + 1;
    moved.updatedAt = now;
    return moved;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
const reorderMenuSubCategoriesAfterDelete = async (deletedId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deleted = await MenuSubcategory.findById(
      new mongoose.Types.ObjectId(deletedId),
      null,
      { session },
    );

    if (!deleted) {
      throw new Error("Subcategory not found");
    }

    const siblings = await MenuSubcategory.find(
      buildSiblingFilter(deleted),
      { _id: 1, order: 1 },
      { session },
    ).sort({ order: 1, updatedAt: 1, _id: 1 });

    const now = new Date();

    const ops = siblings
      .map((doc, index) => ({
        doc,
        order: index + 1,
      }))
      .filter(({ doc, order }) => doc.order !== order)
      .map(({ doc, order }) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              order,
              updatedAt: now,
            },
          },
        },
      }));

    if (ops.length) {
      await MenuSubcategory.bulkWrite(ops, { session });
    }

    await session.commitTransaction();
    session.endSession();

    await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);

    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
module.exports = {
  createMenuSubcategory,
  getMenuSubcategorys,
  findMenuSubcategoryById,
  findByIdAndUpdate,
  getMenuSubcategorysSummary,
  reorderMenuSubCategory,
  reorderMenuSubCategoriesAfterDelete,
};
