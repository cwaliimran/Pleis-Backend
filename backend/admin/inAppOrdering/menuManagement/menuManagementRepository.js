
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuItems = require("@MenuItemsModel");
const { Events } = require("@EventsModel");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const MenuItemsSale = require("@MenuItemsSaleModel");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { calculateMeta } = require("./helper/calculateMeta");
const { formatUpdate } = require("../formatters/updateFormatter");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const findMenuItemById = async (id) => {
  return MenuItems.findById(id);
};

const createSale = async (data) => {
  try {


    const sale = new MenuItemsSale(data);
    await sale.save();
    return sale;
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
    .select("_id title basePrice discountPrice taxPercent ") // Select only _id and title fields
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









const fetchMenuItems = async (organizer) => {
  try {
    const menuItems = await MenuItems.find({ 
      creator: new mongoose.Types.ObjectId(organizer),
      status: "active"
    }).lean(); 
    
    return menuItems;
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return [];
  }
};
const getSummary = async ({
  page,
  limit,
  skip,
  organizer,
  categoryId,
  eventId,
  keyword,
  filter,
  sortBy,
}) => {
  let pipeline = [
    {
      $match: {
        creator: new mongoose.Types.ObjectId(organizer),
        status: "active",
      }
    }
  ];
  console.log("categoryId",categoryId );

  if (categoryId) {
    pipeline.push({
      $match: { category: new mongoose.Types.ObjectId(categoryId) }
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: MenuItems.schema },
        { schema: MenuItemCategories.schema, prefix: "categoryData." }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length > 0) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // Apply custom filters
  if (filter) {
    if (filter === "limited") {
      pipeline.push({
        $match: { isLimitedTimeOffer: true }
      });
    } else if (filter === "upsell") {
      pipeline.push({
        $match: { upSellItem: true }
      });
    } else if (filter === "outOfStock") {
      pipeline.push({
        $match: { isAvailableInStock: false }
      });
    } else if (filter === "schedule") {
      pipeline.push({
        $match: { isScheduled: true }
      });
    }
  }

  // Sorting options
  if (sortBy === "name") {
    pipeline.push({ $sort: { title: 1 } });
  } else if (sortBy === "priceLowToHigh") {
    pipeline.push({ $sort: { basePrice: 1 } });
  } else if (sortBy === "priceHighToLow") {
    pipeline.push({ $sort: { basePrice: -1 } });
  } else if (sortBy === "recentlyAdded") {
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  // Pagination
  pipeline.push({ $skip: skip }, { $limit: limit });

  // Facet for menu items and meta data
  pipeline.push({
    $facet: {
      menuItems: [
        {
          $project: {
            _id: 1,
            title: 1,
            basePrice: 1,
            discountPrice: 1,
            taxPercent: 1,
            image: 1,
            category: 1,
            startDate: 1,
            endDate: 1,
            isAvailableInStock: 1,
            upSellItem: 1,
            isLimitedTimeOffer: 1,
            createdAt: 1,
            category: 1,
            event: 1,
            isScheduled: 1,
            description: 1,
            startTime: 1,
            availabilityType: 1,
            endTime: 1
          }
        },
        {
          $lookup: {
            from: 'menuitemcategories',
            localField: 'category',
            foreignField: '_id',
            pipeline: [{ $project: { title: 1 } }],
            as: 'category'
          }
        },
        {
          $lookup: {
            from: 'events',
            localField: 'event',
            foreignField: '_id',
            pipeline: [{ $project: { 'basicInfo.title': 1, startDate: 1, endDate: 1 } }],
            as: 'event'
          }
        },
        {
          // Unwind categoryDetails and eventDetails to flatten them into objects
          $unwind: {
            path: '$categoryDetails',
            preserveNullAndEmptyArrays: true // This will keep the object null if no match is found
          }
        },
        {
          $unwind: {
            path: '$eventDetails',
            preserveNullAndEmptyArrays: true // This will keep the object null if no match is found
          }
        }
      ],
    }
  });

  try {
        const [aggregationResult, allMenuItems] = await Promise.all([
      MenuItems.aggregate(pipeline),
      fetchMenuItems(organizer) // Fetch all menu items without any filters
    ]);
    console.log("result", aggregationResult);

    if (!aggregationResult || aggregationResult[0].menuItems.length === 0) {
      return { MenuItems: [], meta: { totalMenuItems: 0, inStock: 0, outOfStock: 0, limitedTimeItems: 0, upSellItems: 0, scheduledItems: 0 } };
    }
        const formatedMenuItems = aggregationResult[0].menuItems.map(item => formatUpdate(item));

const meta=calculateMeta(allMenuItems);
    return {
      MenuItems: formatedMenuItems,
       meta
    };
  } catch (error) {
    console.error("Error in getSummary aggregation pipeline:", error);
    return { error: "Error fetching summary data." };
  }
};



module.exports = {
  getMenuItems,
  findMenuById,
  findByIdAndUpdate,
  getMenuItemCategories,
  getEvents,
  createSale,
  getSummary
};