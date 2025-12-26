const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const {Events}= require("@EventsModel");
const Orders = require("@OrdersModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const  TicketingsModel  = require("@TicketingsModel");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const { formatUpdate } = require("../formatters/updateFormatter");
const {NotificationExp, NotificationTypes} = require("@NotificationsModel");
const Menus = require("@MenusModel");
const MenuItems = require("@MenuItemsModel");
const MenuOrders = require("@OrdersModel");
const {sendUserNotifications} = require("../../../controllers/communicationController");
const { formatOrdersForUI } = require("../formatters/formatOrdersForUI");
const getUserIdsForEvent = async (eventId) => {
  try {


    // Aggregate users from both TicketingOrders and UserReservations collections

    const ticketingUsers = await TicketingOrders.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId), // Match by eventId
        },
      },
      {
        $project: {
          user: 1, // Only return user field
        },
      },
      {
        $group: {
          _id: null, // No group key needed
          users: { $addToSet: "$user" }, // Collect unique users
        },
      },
    ]);

    const reservationUsers = await UserReservations.aggregate([
      {
        $match: {
          optionalEventId: new mongoose.Types.ObjectId(eventId), // Match by eventId
        },
      },
      {
        $project: {
          userId: 1, // Only return userId field
        },
      },
      {
        $group: {
          _id: null, // No group key needed
          users: { $addToSet: "$userId" }, // Collect unique users
        },
      },
    ]);

    // Safely check if we have results from both collections
    const ticketingUserIds = ticketingUsers[0]?.users || []; // Default to empty array if no users found
    const reservationUserIds = reservationUsers[0]?.users || []; // Default to empty array if no users found

    // Combine both user arrays (deduplicate using addToSet)
    const combinedUsers = [
      ...ticketingUserIds,
      ...reservationUserIds,
    ];

    // Remove duplicates by converting ObjectId to string and using Set
    const uniqueUserIds = [
      ...new Set(combinedUsers.map(userId => userId.toString())) // Convert each ObjectId to string before deduplicating
    ];
    return uniqueUserIds; // Return the list of unique user IDs
  } catch (err) {

    return []; // Return an empty array in case of an error
  }
};


const createOrders = async (data) => {
  try {
    const userIds = await getUserIdsForEvent(data.event);
    data.creator = await getCreatorOrganizationId(data.creator)

    const update = new Orders(data);
    await update.save();
        await sendUserNotifications({
            recipientIds: userIds, 
            title: update.title,
            body: `A new Orders is live join now : ${update._id}`,
            data: { type: NotificationTypes.Orders_UPDATE, objectType: "group",OrdersId: update._id },
            sender: update.creator,
            objectId: update.event,
          });

    return update; 
  } catch (err) {
    throw new Error("Error saving update: " + err.message); 
  }
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
  const result = await MenuOrders.aggregate(pipeline);


  if (!result?.[0]) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const Orderss = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;


const formated =formatOrdersForUI(Orderss, orderStatus,activeorderStatus,pickupFilter);
  const meta = generateMeta(page, limit, totalFiltered);

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








module.exports = {
  getOrders,
  findOrdersById,
  findByIdAndUpdate,


};