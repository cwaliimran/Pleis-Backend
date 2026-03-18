
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
  organization,
  date,
  skip, // skip is calculated based on page and limit
  pickupFilter,
  orderStatus,
  activeorderStatus,
  sortDirection = 1
}) => {


  let organizationsIds = [];
  if (organization) {
    // Handle comma or '%' separated values and convert to ObjectIds
    organizationsIds = organization
      .split(/[,%]+/)  // Split by comma or '%'
      .map(id => new mongoose.Types.ObjectId(id.trim()));  // Convert to ObjectId
  }

  // Prepare status filter dynamically
  let statusFilter = {};
  // if(pickupFilter=="tableService"){
  //   tableService
  // }
  if (orderStatus === 'postorders') {
    // For postorders, include both completed and cancelled orders, with at least one item marked as delivered
    statusFilter = {
      status: { $in: ["completed", "cancelled"] },
      paymentStatus: { $in: ["paid"] },

      // Ensure that at least one item has been delivered for completed orders
      $or: [
        {
          status: "completed",
          items: { $elemMatch: { isdelivered: true } }  // At least one item is delivered
        },
        {
          status: "cancelled"  // Include all cancelled orders
        }
      ]
    };
  } else if (orderStatus === "completed") {
    // For completed orders, ensure that all items are delivered
    statusFilter = {
      status: "completed",
      items: { $elemMatch: { isdelivered: true } }  // All items are delivered
    };
  } else if (orderStatus === "cancelled") {
    // For cancelled orders, include all cancelled orders
    statusFilter = {
      status: "cancelled"
    };
  }

  else if (orderStatus === "active") {
    if (activeorderStatus === "new") {
      // Initialize the status filter with 'pending' status
      statusFilter = { status: "pending" };


      // Add pickupType to the filter if pickupFilter exists
      if (pickupFilter) {
        if (pickupFilter === "preorder") {
          // If pickupFilter is "preorder", set the orderType to "preorder"
          statusFilter.orderType = "preorder";
        } else {
          // Otherwise, set pickupType and ensure orderType is not "preorder"
          statusFilter.pickupType = pickupFilter; // Merge pickupType with statusFilter
          statusFilter.orderType = { $ne: "preorder" };
        }
      }
    }
    else if (activeorderStatus === "inProgress") {
      statusFilter = {
   
           items: { $elemMatch: { isdelivered: false } }

      };
    } else if (activeorderStatus === "completed") {
      statusFilter = {
        status: "completed",
        $or: [
          {
            $and: [
              { items: { $not: { $elemMatch: { isdelivered: false } } } },
              { paymentStatus: { $in: ["pending", "failed"] } }
            ]
          }
        ]
      };
    }
  }
  else if (orderStatus === 'preorder') {
    statusFilter = {
      status: 'pending',
      orderType: 'preorder'
    };
  }
  let keywordMatch = {};
  if (keyword && keyword.trim()) {
    keywordMatch =
      keyword && keyword.trim()
        ? {
          $or: [
            { "user.firstName": { $regex: keyword, $options: "i" } },
            { "user.lastName": { $regex: keyword, $options: "i" } },
            { "user.email": { $regex: keyword, $options: "i" } },
            { "orderNumber": { $regex: keyword, $options: "i" } }
          ]
        }
        : null;
  }

  // Create query for event count
  const eventCountQuery = {
    ...statusFilter,
    ...keywordMatch,
    organization: { $in: organizationsIds }  // Add organization match
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
            { $toObjectId: "$user" }
          ]
        }
      }
    },
    {
      $match: {
        organization: { $in: organizationsIds }  // Match against the parsed organizations
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
          email: { $arrayElemAt: ["$userInfo.email", 0] },
          profileIcon: {
            $concat: [
              process.env.AZURE_STORAGE_BASE_URL,
              { $ifNull: [{ $arrayElemAt: ["$userInfo.profileIcon", 0] }, "noimage.png"] }
            ]
          }
        }
      }
    },
    {
      $match: {
        ...statusFilter,
        ...keywordMatch, // Combine the filters in the match stage

      }
    },

    // 🔹 Pagination with skip and limit
    { $skip: skipValue || 0 }, // Use skipValue to skip records based on page and limit
    { $limit: limit || 10 },
    { $sort: { createdAt: sortDirection } },

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
        tableNumber: 1,
        user: 1, // Include the user info in the final result
        organization: 1
      }
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
  const result = filteredOrders;
  if (!result?.[0]) {
    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }
  const constantData = formatOrdersForUI(allOrders);
  const Orderss = result[0].data || [];
  let meta = generateMeta(page, limit, count.totalFiltered);
  meta.constantData = constantData;
  meta.count = count;

  return { Orderss, meta };
};










const findOrdersById = async (id) => {
  return Orders.findById(id)
    .populate({
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
    const organization = await Organizations.findById(organizationId).select('creator').lean();

    // Return the creator's organizationId
    return organization.creator;  // Directly return the creator's ID

  } catch (error) {
    return { message: 'Error fetching organization' };
  }
};

const getInAppOrders = async ({ organization }) => {
  const menus = await Menus.find({ organization, status: "active" })
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