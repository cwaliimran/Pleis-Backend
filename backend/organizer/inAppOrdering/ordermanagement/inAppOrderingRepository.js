
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

const getOrganizationIdsByOrganizer = async (organizerId) => {
  const orgs = await Organizations.find(
    { creator: new mongoose.Types.ObjectId(organizerId) },
    { _id: 1 }
  ).lean();

  return orgs.map(o => o._id);
};

const getOrders = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organizationId,
  date,
  skip,
  pickupFilter,
  orderStatus,
  activeorderStatus
}) => {

if (Array.isArray(organizationId)) {
  organizationIds = organizationId;
} else if (typeof organizationId === "string") {
  organizationIds = organizationId.includes("%")
    ? organizationId.split("%")
    : organizationId.split(",");
}

// clean + remove empty values
organizationIds = organizationIds
  .map(id => id.trim())
  .filter(Boolean);

if (!organizationIds.length) {
  return { Orderss: [], meta: generateMeta(page, limit, 0) };
}

  const menus = await Menus.find({
    organization: { $in: organizationIds },
    status: "active"
  }).select("_id").lean();

  if (!menus.length) {
    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }
  const menuIds = menus.map(m => m._id);
  const menuItems = await MenuItems.find({
    menu: { $in: menuIds },
    status: "active"
  }).select("_id menu").lean();
  if (!menuItems.length) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const menuItemIds = menuItems.map(i => i._id);
  const keywordMatch =
    keyword && keyword.trim()
      ? {
        $match: {
          $or: [
            { "user.firstName": { $regex: keyword, $options: "i" } },
            { "user.userlastName": { $regex: keyword, $options: "i" } },
            { "user.email": { $regex: keyword, $options: "i" } }
          ]
        }
      }
      : null;

  const pipeline = [
    {
      $match: {
        ...(status && { status }),
        ...(date && {
          createdAt: {
            $gte: new Date(date),
            $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
          }
        }),
        "items.menuItem": { $in: menuItemIds }
      }
    },

    // 🔹 Ensure ObjectId
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

    // 🔹 Lookup user
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userInfo"
      }
    },

    // 🔹 Build user {}
    {
      $addFields: {
        user: {
          _id: "$userObjectId",
          username: { $arrayElemAt: ["$userInfo.username", 0] },
          firstName: { $arrayElemAt: ["$userInfo.firstName", 0] },
          userlastName: { $arrayElemAt: ["$userInfo.lastName", 0] },
          email: { $arrayElemAt: ["$userInfo.email", 0] }
        }
      }
    },

    // ✅ 🔍 KEYWORD SEARCH GOES HERE
    ...(keywordMatch ? [keywordMatch] : []),

    // 🔹 Cleanup
    {
      $project: {
        userInfo: 0,
        userObjectId: 0
      }
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [
          { $skip: skip },
          ...(limit === 0 ? [] : [{ $limit: limit }])
        ],
        totalFiltered: [{ $count: "count" }]
      }
    }
  ];






  // 4️⃣ Run aggregation
  const result = await MenuOrders.aggregate(pipeline);


  if (!result?.[0]) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const Orderss = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;


  const formated = formatOrdersForUI(Orderss, orderStatus, activeorderStatus, pickupFilter);

  const meta = generateMeta(page, limit, formated.totalFiltered);
  formated.totalFiltered = undefined; // remove totalFiltered from formated as it's now in meta

  return { Orderss: formated, meta };
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