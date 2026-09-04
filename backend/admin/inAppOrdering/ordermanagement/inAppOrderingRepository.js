const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const Orders = require("@OrdersModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const { formatUpdate } = require("../formatters/updateFormatter");
const Menus = require("@MenusModel");
const MenuItems = require("@MenuItemsModel");
const MenuOrders = require("@OrdersModel");
const { formatOrdersForUI } = require("../formatters/formatOrdersForUI");
const { getModelCounts } = require("@utils/dbUtils/queryUtil");
const { getFullImageUrl } = require("@utils/imageHelper");

const withFullItemImage = (item) => {
  if (!item?.menuItemSnapShot) return item;
  return {
    ...item,
    menuItemSnapShot: {
      ...item.menuItemSnapShot,
      image: getFullImageUrl(item.menuItemSnapShot.image || "noimage.png"),
    },
  };
};

const withOrderItemImageUrls = (order) => {
  if (!order) return order;
  return {
    ...order,
    items: Array.isArray(order.items)
      ? order.items.map(withFullItemImage)
      : order.items,
    combos: Array.isArray(order.combos)
      ? order.combos.map((combo) => ({
          ...combo,
          items: Array.isArray(combo.items)
            ? combo.items.map(withFullItemImage)
            : combo.items,
        }))
      : order.combos,
  };
};

const getOrganizationIdsByOrganizer = async (organizerId) => {
  const orgs = await Organizations.find(
    { creator: new mongoose.Types.ObjectId(organizerId) },
    { _id: 1 },
  ).lean();

  return orgs.map((o) => o._id);
};
const normalizePickupType = (value = "") =>
  value.toLowerCase().replace(/\s+/g, "");

const getEventsCounts = async (query) => {
  return getModelCounts({ model: MenuOrders, filterQuery: query });
};
const getOrders = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,
  startDate,
  endDate,
  skip,
  pickupFilter,
  paymentMethod,
  sortDirection = -1,
  companyOrganizer,
  orderStatus,
  paymentStatus,
}) => {
  let organizationsIds = [];
  if (organization) {
    // Handle comma or '%' separated values and convert to ObjectIds
    organizationsIds = organization
      .split(/[,%]+/) // Split by comma or '%'
      .map((id) => new mongoose.Types.ObjectId(id.trim())); // Convert to ObjectId
  }

  if (pickupFilter) {
    console.log("pickupFilter", pickupFilter);
  }

  // Prepare status filter dynamically
  let statusFilter = {};
  // if(pickupFilter=="tableService"){
  //   tableService
  // }

  let keywordMatch = {};
  if (keyword && keyword.trim()) {
    keywordMatch =
      keyword && keyword.trim()
        ? {
            $or: [
              { "user.firstName": { $regex: keyword, $options: "i" } },
              { "user.lastName": { $regex: keyword, $options: "i" } },
              { "user.username": { $regex: keyword, $options: "i" } },
              { "user.email": { $regex: keyword, $options: "i" } },
              { orderNumber: { $regex: keyword, $options: "i" } },
            ],
          }
        : null;
  }

  if (status && status.trim()) {
    if (status.trim() === "active") {
      statusFilter = {
        status: { $nin: ["cancelled", "completed", "rejected"] },
      };
    } else if (status.trim() === "past") {
      statusFilter = {
        status: { $in: ["cancelled", "completed", "rejected"] },
      };
    }
  }
  if (paymentStatus && paymentStatus.trim()) {
    statusFilter.paymentStatus = paymentStatus.trim();
  }
  if (orderStatus && orderStatus.trim()) {
    statusFilter = { status: orderStatus.trim() };
  }



  if (paymentMethod && paymentMethod.trim()) {
    statusFilter.paymentMethod = paymentMethod.trim();
  }
  if (date && date.trim()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    statusFilter.createdAt = { $gte: start, $lte: end };
  }
  if (startDate && endDate) {
    statusFilter.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Create query for event count
  const eventCountQuery = {
    ...statusFilter,
    ...keywordMatch,
    organization: { $in: organizationsIds }, // Add organization match
  };

  const skipValue = (page - 1) * limit; // Skip formula

  const pipeline = [
    // 🔹 Match status and keyword filter

    // 🔹 Add userObjectId field to ensure it's in ObjectId format
    {
      $addFields: {
        userObjectId: {
          $cond: [
            { $eq: [{ $type: "$user" }, "objectId"] },
            "$user",
            { $toObjectId: "$user" },
          ],
        },
      },
    },
    {
      $match: {
        organization: { $in: organizationsIds }, // Match against the parsed organizations
      },
    },

    // 🔹 Filter by delivery option (pickup) when provided
    ...(pickupFilter
      ? [
          {
            $match: {
              deliveryOption: new mongoose.Types.ObjectId(pickupFilter),
            },
          },
        ]
      : []),

    // 🔹 Lookup user information from the "users" collection
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    {
      $lookup: {
        from: "deliveryoptions",
        localField: "deliveryOption",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1,
            },
          },
        ],
        as: "deliveryOption",
      },
    },
    {
      $unwind: {
        path: "$deliveryOption",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "clubmembers",
        localField: "userObjectId",
        foreignField: "user",
        pipeline: [
          {
            $match: {
              companyOrganizer: companyOrganizer,
            },
          },
          {
            $project: {
              _id: 1,
              tierKey: 1,
            },
          },
        ],
        as: "clubMemberInfo",
      },
    },
    {
      $addFields: {
        clubMemberInfo: { $arrayElemAt: ["$clubMemberInfo", 0] },
      },
    },

    // 🔹 Build the user object and add it to the document
    {
      $addFields: {
        user: {
          _id: "$userObjectId",
          username: { $arrayElemAt: ["$userInfo.username", 0] },
          firstName: { $arrayElemAt: ["$userInfo.firstName", 0] },
          lastName: { $arrayElemAt: ["$userInfo.lastName", 0] },
          email: { $arrayElemAt: ["$userInfo.email", 0] },
          profileIcon: {
            $concat: [
              process.env.AZURE_STORAGE_BASE_URL,
              {
                $ifNull: [
                  { $arrayElemAt: ["$userInfo.profileIcon", 0] },
                  "noimage.png",
                ],
              },
            ],
          },
        },
      },
    },
    {
      $match: {
        ...statusFilter,
        ...keywordMatch, // Combine the filters in the match stage
      },
    },

    // Sort before skip/limit so newest orders appear on page 1
    { $sort: { createdAt: sortDirection, _id: sortDirection } },
    { $skip: skipValue || 0 },
    { $limit: limit || 10 },

    // 🔹 Project the necessary fields for the response
    {
      $project: {
        _id: 1,
        orderNumber: 1,
        status: 1,
        items: 1,
        totalPrice: 1,
        paymentStatus: 1,
        deliveryOption: 1,
        paymentMethod: 1,
        pickupType: 1,
        createdAt: 1,
        combos: 1,
        paymentTiming: 1,
        orderType: 1,
        tableNumber: 1,
        user: 1, // Include the user info in the final result
        organization: 1,
        priceBreakdown: 1,
        clubMemberInfo: 1,
      },
    },

    // 🔹 Return additional metadata and pagination details
    {
      $facet: {
        data: [{ $match: {} }], // Pass through the matched data
        meta: [
          { $count: "totalRecords" },
          {
            $project: {
              totalPages: {
                $ceil: { $divide: ["$totalRecords", limit || 10] },
              },
              totalRecords: 1,
            },
          },
        ],
      },
    },
  ];


  const [filteredOrders, activeCount, rejectedCompletedCount, count] =
    await Promise.all([
      MenuOrders.aggregate(pipeline),
      Orders.countDocuments({
        organization: { $in: organizationsIds },
        status: { $nin: ["cancelled", "completed", "rejected"] },
      }),
      Orders.countDocuments({
        organization: { $in: organizationsIds },
        status: { $in: ["cancelled", "completed", "rejected"] },
      }),
      getEventsCounts(eventCountQuery),
    ]);
  const result = filteredOrders;
  if (!result?.[0]) {
    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }
  const Orderss = (result[0].data || []).map(withOrderItemImageUrls);
  let meta = generateMeta(page, limit, count.totalFiltered);
  meta.constantData = { activeCount, rejectedCompletedCount };

  return { Orderss, meta };
};

const findOrdersById = async (id) => {
  return Orders.findById(id).populate({
    path: "organization",
    select: "creator",
  });
};

const findByIdAndUpdate = async (id, data) => {
  return Orders.findByIdAndUpdate(id, data, { new: true });
};

const getCreatorOrganizationId = async (organizationId) => {
  try {
    // Find the organization by its ID
    const organization = await Organizations.findById(organizationId)
      .select("creator")
      .lean();

    // Return the creator's organizationId
    return organization.creator; // Directly return the creator's ID
  } catch (error) {
    return { message: "Error fetching organization" };
  }
};

const getInAppOrders = async ({ organization }) => {
  const menus = await Menus.find({ organization, status: "active" })
    .select("isOrderingEnabled")
    .lean();

  return menus[0];
};
const getOrderById = async (orderId) => {
  return Orders.findById(orderId).lean();
};

const getOrderByIdForAdminUI = async (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return null;

  const _id = new mongoose.Types.ObjectId(orderId);
  const existing = await Orders.findById(_id).select("organization").lean();
  if (!existing) return null;

  const org = await Organizations.findById(existing.organization)
    .select("creator")
    .lean();
  const companyOrganizer = org?.creator || null;

  const pipeline = [
    { $match: { _id } },
    {
      $addFields: {
        userObjectId: {
          $cond: [
            { $eq: [{ $type: "$user" }, "objectId"] },
            "$user",
            { $toObjectId: "$user" },
          ],
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    {
      $lookup: {
        from: "deliveryoptions",
        localField: "deliveryOption",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "deliveryOption",
      },
    },
    {
      $unwind: {
        path: "$deliveryOption",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "clubmembers",
        localField: "userObjectId",
        foreignField: "user",
        pipeline: [
          ...(companyOrganizer
            ? [{ $match: { companyOrganizer } }]
            : [{ $match: { _id: null } }]),
          { $project: { _id: 1, tierKey: 1 } },
        ],
        as: "clubMemberInfo",
      },
    },
    {
      $addFields: {
        clubMemberInfo: { $arrayElemAt: ["$clubMemberInfo", 0] },
        user: {
          _id: "$userObjectId",
          username: { $arrayElemAt: ["$userInfo.username", 0] },
          firstName: { $arrayElemAt: ["$userInfo.firstName", 0] },
          lastName: { $arrayElemAt: ["$userInfo.lastName", 0] },
          email: { $arrayElemAt: ["$userInfo.email", 0] },
          profileIcon: {
            $concat: [
              process.env.AZURE_STORAGE_BASE_URL || "",
              {
                $ifNull: [
                  { $arrayElemAt: ["$userInfo.profileIcon", 0] },
                  "noimage.png",
                ],
              },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        orderNumber: 1,
        status: 1,
        items: 1,
        totalPrice: 1,
        paymentStatus: 1,
        deliveryOption: 1,
        paymentMethod: 1,
        pickupType: 1,
        createdAt: 1,
        combos: 1,
        orderType: 1,
        tableNumber: 1,
        user: 1,
        organization: 1,
        priceBreakdown: 1,
        clubMemberInfo: 1,
      },
    },
  ];

  const [doc] = await MenuOrders.aggregate(pipeline);
  return withOrderItemImageUrls(doc) || null;
};

module.exports = {
  getOrders,
  findOrdersById,
  findByIdAndUpdate,
  getInAppOrders,
  getOrderById,
  getOrderByIdForAdminUI,
  withOrderItemImageUrls,
};
