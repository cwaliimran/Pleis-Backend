
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

const getOrganizationIdsByOrganizer = async (organizerId) => {
  const orgs = await Organizations.find(
    { creator: new mongoose.Types.ObjectId(organizerId) },
    { _id: 1 }
  ).lean();

  return orgs.map(o => o._id);
};
const normalizePickupType = (value = "") =>
  value.toLowerCase().replace(/\s+/g, "");

const getEventsCounts = async (query) => {
  return getModelCounts({ model: MenuOrders, filterQuery: query });
}
const getOrders = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  companyOrganizer,
  date,
  skip,
  pickupFilter,
  orderStatus,
  activeorderStatus
}) => {

  const organizationsIds = await getOrganizationIdsByOrganizer(companyOrganizer);
  // Prepare status filter dynamically
  let statusFilter = {};

  if (orderStatus === 'postorders') {
    statusFilter = {
      status: { $in: ["completed", "cancelled"] },
      paymentStatus: "paid",
      items: { $elemMatch: { isdelivered: true } }
    };
  } if (orderStatus === "active" && status != "cancelled") {
    if (activeorderStatus === "new") {
      statusFilter = { status: "pending" };
      statusFilter = { pickupType: normalizePickupType(pickupFilter) };
    }
    else if (activeorderStatus === "inProgress") {
      statusFilter = { status: { $in: ["confirmed", "sent"] } };
    }
    else if (activeorderStatus === "completed") {
      statusFilter = {
        status: "completed", items: {
          $elemMatch: { isdelivered: false },
          paymentStatus: { $in: ["pending", "failed"] }
        }
      };
    }


  }
  else if (orderStatus === 'preorder') {
    statusFilter = {
      status: 'preorder',
      orderType: 'preorder'
    };
  }
  const keywordMatch =
    keyword && keyword.trim()
      ? {
          $or: [
            { "user.firstName": { $regex: keyword, $options: "i" } },
            { "user.lastName": { $regex: keyword, $options: "i" } },
            { "user.email": { $regex: keyword, $options: "i" } }
          ]
        }
      : null;
  // Create query for event count
  const eventCountQuery = {
    ...statusFilter,
    ...keywordMatch // Add keyword filter for event count as well
  };
const pipeline = [
  // 🔹 Match status and keyword filter
  {
    $match: {
      ...statusFilter,
      ...keywordMatch, // Combine the filters in the match stage
    }
  },

  // 🔹 Add userObjectId field to ensure it's in ObjectId format
  {
    $addFields: {
      userObjectId: {
        $cond: [
          { $eq: [{ $type: "$user" }, "objectId"] },
          "$user",
          { $toObjectId: "$user" }
        ]
      }
    }
  },

  // 🔹 Lookup user information from the "users" collection
  {
    $lookup: {
      from: "users",
      localField: "userObjectId",
      foreignField: "_id",
      as: "userInfo"
    }
  },

  // 🔹 Build the user object and add it to the document
  {
    $addFields: {
      user: {
        _id: "$userObjectId",
        username: { $arrayElemAt: ["$userInfo.username", 0] },
        firstName: { $arrayElemAt: ["$userInfo.firstName", 0] },
        lastName: { $arrayElemAt: ["$userInfo.lastName", 0] },
        email: { $arrayElemAt: ["$userInfo.email", 0] }
      }
    }
  },

  // 🔹 Pagination with skip and limit
  { $skip: skip || 0 },
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
      paymentMethod: 1,
      pickupType: 1,
      createdAt: 1,
      orderType: 1,
      user: 1 // Include the user info in the final result
    }
  },

  // 🔹 Return additional metadata and pagination details
  {
    $facet: {
      data: [{ $skip: skip || 0 }, { $limit: limit || 10 }],
      meta: [
        { $count: "totalRecords" },
        {
          $project: {
            totalPages: {
              $ceil: { $divide: ["$totalRecords", limit || 10] }
            },
            totalRecords: 1
          }
        }
      ]
    }
  }
];



  const [filteredOrders, allOrders, count] = await Promise.all([
    MenuOrders.aggregate(pipeline),
    MenuOrders.find({ organization: { $in: organizationsIds } }),
    getEventsCounts(eventCountQuery)
  ]);
  console.log("organizationsIds", organizationsIds);
  const result = filteredOrders;
  if (!result?.[0]) {
    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }
  const constantData = formatOrdersForUI(allOrders);
  const Orderss = result[0].data || [];
  const totalFiltered = Orderss.length || 0;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.constantData = constantData;
  meta.count = count;
  return { Orderss, meta };
};









const findOrdersById = async (id) => {
  return Orders.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Orders.findByIdAndUpdate(id, data, { new: true });
};



const getCreatorOrganizationId = async (organizationId) => {
  try {

    // Find the organization by its ID
    const organization = await Organizations.findById(organizationId).select('creator').lean();

    // Return the creator's organizationId
    return organization.creator;  // Directly return the creator's ID

  } catch (error) {
    return { message: 'Error fetching organization' };
  }
};

const getInAppOrders = async ({ creator }) => {
  const menus = await Menus.find({ creator, status: "active" })
    .select("isOrderingEnabled")
    .lean();

  return menus[0]
};
module.exports = {
  getOrders,
  findOrdersById,
  findByIdAndUpdate,
  getInAppOrders


};