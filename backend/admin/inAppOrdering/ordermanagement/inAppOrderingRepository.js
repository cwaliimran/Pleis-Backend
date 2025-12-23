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


  // 1️⃣ Fetch Menus
  const menus = await Menus.find({
    organization: organizationId,
    status: "active"
  }).select("_id").lean();



  if (!menus.length) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const menuIds = menus.map(m => m._id);



  // 2️⃣ Fetch MenuItems
  const menuItems = await MenuItems.find({
    menu: { $in: menuIds },
    status: "active"
  }).select("_id menu").lean();



  if (!menuItems.length) {

    return { Orderss: [], meta: generateMeta(page, limit, 0) };
  }

  const menuItemIds = menuItems.map(i => i._id);



  // 3️⃣ Build aggregation pipeline
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

    // ...(keyword ? [{
    //   $match: {
    //     $or: [
    //       { deliveryAddress: { $regex: keyword, $options: "i" } },
    //       { paymentMethod: { $regex: keyword, $options: "i" } },
    //       { status: { $regex: keyword, $options: "i" } },
    //       { $expr: { $regexMatch: { input: { $toString: "$totalPrice" }, regex: keyword } } }
    //     ]
    //   }
    // }] : []),

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



const getWinners = async ({ OrdersId, timezone, page, limit, skip }) => {
  try {
    const pipeline = [
      // Step 1: Match the given OrdersId
      {
        $match: {
          _id: new mongoose.Types.ObjectId(OrdersId),  // Match the Orders
        },
      },

      // Step 2: Lookup Orders participants and filter only winners
      {
        $lookup: {
          from: "Ordersparticipants",  // Collection name for OrdersParticipants
          localField: "_id",  // Field in Orders
          foreignField: "Orders",  // Field in OrdersParticipants
          as: "participants",  // Alias for the joined data
        },
      },
      {
        $unwind: { path: "$participants", preserveNullAndEmptyArrays: true },  // Flatten the 'participants' array
      },

      // Step 3: Filter only winners (where isWinner is true)
      {
        $match: {
          "participants.isWinner": true,  // Only include winners
        },
      },

      // Step 4: Lookup for user details (first name, last name, email, username)
      {
        $lookup: {
          from: "users",  // Collection name for Users
          localField: "participants.user",  // Field in OrdersParticipants (user field)
          foreignField: "_id",  // Field in Users collection
          as: "user",  // Alias for the joined data
        },
      },
      {
        $unwind: { path: "$user", preserveNullAndEmptyArrays: true },  // Flatten the 'user' array
      },

      // Step 5: Project only necessary fields (event title, ticket title, and winner details)
      {
        $project: {
          eventTitle: 1,  // Event title from Orders
          ticketTitle: 1,  // Ticket title from Orders
          firstName: "$user.firstName",  // First name of the winner
          lastName: "$user.lastName",  // Last name of the winner
          email: "$user.email",  // Email of the winner
          username: "$user.username",  // Username of the winner
        },
      },

      // Step 6: Apply pagination and count using $facet
      {
        $facet: {
          data: [
            { $skip: skip },  // Pagination skip
            ...(limit === 0 ? [] : [{ $limit: limit }])  // Apply limit if provided
          ],
          totalFiltered: [{ $count: "count" }],  // Total count of filtered results
        },
      },
    ];

    // Execute the aggregation pipeline
    const result = await Orders.aggregate(pipeline);

    // Check if the result is valid and contains data
    if (!result || !result[0] || !result[0].data) {
      return { winners: [], meta: { totalFiltered: 0 } };
    }

    // Handle the aggregation results
    const winners = result[0].data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Meta information for pagination
    const meta = { totalFiltered };

    return { winners, meta };
  } catch (err) {
    throw new Error("Error retrieving winners: " + err.message);
  }
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

const getevents = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organizationId,
  date,
  skip
}) => {

   let userId = await getCreatorOrganizationId(organizationId)
  const pipeline = [
    // Step 1: Match events where creator matches the provided userId
    {
      $match: {
        ...(userId && { creator: userId }) // Filter events where creator == userId
      }
    }
  ];

  // Step 2: Apply filters for status, date, etc.
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } }); // Default filter to exclude 'deleted' status
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end } // Filter events based on the provided date
      }
    });
  }

  // Step 3: Apply keyword search
  if (keyword) {
    // Search only in the 'title' field inside 'basicInfo'
    pipeline.push({
      $match: {
        "basicInfo.title": { $regex: keyword, $options: "i" } // Case-insensitive search for keyword in the title
      }
    });
  }

  // Step 4: Project only the fields we need (_id and title)
  pipeline.push({
    $project: {
      _id: 1, // Include _id
     title: "$basicInfo.title" // Include title from basicInfo
    }
  });

  // Step 5: Sort by createdAt (descending order)
  pipeline.push({ $sort: { createdAt: -1 } });

  // Step 6: Apply pagination + total count using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip }, // Pagination skip
        ...(limit === 0 ? [] : [{ $limit: limit }]) // Apply limit if provided
      ],
      totalFiltered: [{ $count: "count" }] // Total count of events
    }
  });

  // Execute aggregation
  const result = await Events.aggregate(pipeline);
  // Step 7: Check if result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { events: [], meta: { totalFiltered: 0, eventsCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 8: Handle aggregation results
  let events = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 9: Meta counts (active/inactive/total events for the given userId)
  const [total, active, inactive] = await Promise.all([
    Events.countDocuments({ creator: userId, status: { $ne: "deleted" } }), // Total events for the user
    Events.countDocuments({ creator: userId, status: "active" }), // Active events for the user
    Events.countDocuments({ creator: userId, status: "inactive" }) // Inactive events for the user
  ]);

  // Step 10: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.eventsCount = { total, active, inactive };

  return { events, meta };
};





const gettickets = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  skip,
  eventId
}) => {
  const pipeline = [
    // Step 1: Match events where creator matches the provided userId
    {
      $match: {
        ...(eventId && { event: new mongoose.Types.ObjectId(eventId) }) // Filter events where creator == userId
      }
    }
  ];

  // Step 2: Apply filters for status, date, etc.
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } }); // Default filter to exclude 'deleted' status
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end } // Filter events based on the provided date
      }
    });
  }

  // Step 3: Apply keyword search
  if (keyword) {
    // Search only in the 'title' field inside 'basicInfo'
    pipeline.push({
      $match: {
        "title": { $regex: keyword, $options: "i" } // Case-insensitive search for keyword in the title
      }
    });
  }

  // Step 4: Project only the fields we need (_id and title)
  pipeline.push({
    $project: {
      _id: 1, // Include _id
     title: "$title" // Include title from basicInfo
    }
  });

  // Step 5: Sort by createdAt (descending order)
  pipeline.push({ $sort: { createdAt: -1 } });

  // Step 6: Apply pagination + total count using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip }, // Pagination skip
        ...(limit === 0 ? [] : [{ $limit: limit }]) // Apply limit if provided
      ],
      totalFiltered: [{ $count: "count" }] // Total count of events
    }
  });

  // Execute aggregation
  const result = await TicketingsModel.aggregate(pipeline);

  // Step 7: Check if result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { events: [], meta: { totalFiltered: 0, eventsCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 8: Handle aggregation results
  let tickets = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 9: Meta counts (active/inactive/total events for the given userId)
  const [total, active, inactive] = await Promise.all([
    TicketingsModel.countDocuments({ creator: userId, status: { $ne: "deleted" } }), // Total events for the user
    TicketingsModel.countDocuments({ creator: userId, status: "active" }), // Active events for the user
    TicketingsModel.countDocuments({ creator: userId, status: "inactive" }) // Inactive events for the user
  ]);

  // Step 10: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.eventsCount = { total, active, inactive };

  return { tickets, meta };
};
module.exports = {
  createOrders,
  getOrders,
  findOrdersById,
  findByIdAndUpdate,
  getevents,
  getUserIdsForEvent,
  gettickets,
  getWinners

};