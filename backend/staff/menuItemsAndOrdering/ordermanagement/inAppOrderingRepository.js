const { generateMeta } = require("@utils/responseUtil");
const Orders = require("@OrdersModel");
const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const MenuItems = require("@MenuItemsModel");
const { formatOrdersForUI } = require("../../../admin/inAppOrdering/formatters/formatOrdersForUI");



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
  const menus = await Menus.find({
    organization: organizationId,
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
  const result = await Orders.aggregate(pipeline);


  if (!result?.[0]) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const Orderss = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;


  const formated = formatOrdersForUI(Orderss, orderStatus, activeorderStatus, pickupFilter);
  const meta = generateMeta(page, limit, totalFiltered);

  return { Orderss: formated, meta };
};







const findOrdersById = async (id) => {
  return Orders.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Orders.findByIdAndUpdate(id, data, { new: true });
};


const updateIsOrderingEnabled = async (organization, isOrderingEnabled) => {
  const updatedMenu = await Menus.findOneAndUpdate(
    { organization },
    { isOrderingEnabled },
    { new: true } 
  ).select("isOrderingEnabled").lean();

  return updatedMenu;
};





module.exports = {
  getOrders,
  findOrdersById,
  findByIdAndUpdate,
  updateIsOrderingEnabled
};