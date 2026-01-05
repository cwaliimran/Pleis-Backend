
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuItems = require("@MenuItemsModel");
const {Events} = require("@EventsModel");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const getUserIdsForEvent = async (eventId) => {
  try {


    // Aggregate users from both TicketingMenu and UserReservations collections

    const ticketingUsers = await TicketingMenu.aggregate([
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


const createMenu = async (data) => {
  try {
    const userIds = await getUserIdsForEvent(data.event);
    data.creator = await getCreatorOrganizationId(data.creator)

    const update = new Menu(data);
    await update.save();
    await sendUserNotifications({
      recipientIds: userIds,
      title: update.title,
      body: `A new Menu is live join now : ${update._id}`,
      data: { type: NotificationTypes.Menu_UPDATE, objectType: "group", MenuId: update._id },
      sender: update.creator,
      objectId: update.event,
    });

    return update;
  } catch (err) {
    throw new Error("Error saving update: " + err.message);
  }
};


const getMenuItems = async ({
  page,
  limit,
  skip,
  organizer, // Creator (organizer)
}) => {
  // Step 1: Find MenuItems by organizer (creator)
  const menuItems = await MenuItems.find({
    creator: organizer, // Filter by creator (organizer)
    status: "active" // Only active items
  })
    .select("_id title") // Select only _id and title fields
    .skip(skip)
    .limit(limit)
    .lean();

  if (!menuItems.length) {
    return { MenuItems: [], meta: generateMeta(page, limit, 0) };
  }

  const totalFiltered = await MenuItems.countDocuments({
    creator: organizer,
    status: "active",
  });

  // Step 2: Return the simplified response with meta
  const meta = generateMeta(page, limit, totalFiltered);

  return { MenuItems: menuItems, meta };
};







const findMenuById = async (id) => {
  return Menu.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Menu.findByIdAndUpdate(id, data, { new: true });
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






const getMenuItemCategories = async ({
  page,
  limit,
  skip,
}) => {
  // Step 1: Find MenuItems by organizer (creator)
  const menuItems = await MenuItemCategories.find({
    status: "active" // Only active items
  })
    .select("_id title") // Select only _id and title fields
    .skip(skip)
    .limit(limit)
    .lean();

  if (!menuItems.length) {
    return { MenuItems: [], meta: generateMeta(page, limit, 0) };
  }

  const totalFiltered = await MenuItemCategories.countDocuments({
    status: "active",
  });

  // Step 2: Return the simplified response with meta
  const meta = generateMeta(page, limit, totalFiltered);

  return { MenuItems: menuItems, meta };
};




const getEvents = async ({
  page,
  limit,
  skip,
  organizer, // Creator (organizer)
}) => {
  // Step 1: Find MenuItems by organizer (creator)
  const menuItems = await Events.find({
    creator: organizer, // Filter by creator (organizer)
    status: "active" // Only active items
  })
    .select("_id basicInfo.title") // Select only _id and title fields
    .skip(skip)
    .limit(limit)
    .lean();

  if (!menuItems.length) {
    return { MenuItems: [], meta: generateMeta(page, limit, 0) };
  }

  const totalFiltered = await Events.countDocuments({
    creator: organizer,
    status: "active",
  });

  // Step 2: Return the simplified response with meta
  const meta = generateMeta(page, limit, totalFiltered);

  return { MenuItems: menuItems, meta };
};


module.exports = {
  getMenuItems,
  findMenuById,
  findByIdAndUpdate,
  getMenuItemCategories,
  getEvents
};