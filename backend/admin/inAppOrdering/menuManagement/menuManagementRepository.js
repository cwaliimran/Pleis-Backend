
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
  let basePipeline = [
    {
      $match: {
        creator: new mongoose.Types.ObjectId(organizer),
        status: "active",
      }
    }
  ];

  if (categoryId) {
    basePipeline.push({
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
      basePipeline.push({ $match: keywordMatch });
    }
  }

  // Apply custom filters
  if (filter) {
    if (filter === "limited") {
      basePipeline.push({
        $match: { isLimitedTimeOffer: true }
      });
    } else if (filter === "upsell") {
      basePipeline.push({
        $match: { upSellItem: true }
      });
    } else if (filter === "outOfStock") {
      basePipeline.push({
        $match: { isAvailableInStock: false }
      });
    } else if (filter === "schedule") {
      basePipeline.push({
        $match: { isScheduled: true }
      });
    }
  }

  // Sorting options
  if (sortBy === "name") {
    basePipeline.push({ $sort: { title: 1 } });
  } else if (sortBy === "priceLowToHigh") {
    basePipeline.push({ $sort: { basePrice: 1 } });
  } else if (sortBy === "priceHighToLow") {
    basePipeline.push({ $sort: { basePrice: -1 } });
  } else if (sortBy === "recentlyAdded") {
    basePipeline.push({ $sort: { createdAt: -1 } });
  }

  // Pagination Pipeline
  const paginationPipeline = [
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
    {
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
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } }
        ],
      }
    }
  ];

  // Non-pagination Pipeline (without $skip and $limit)
  const nonPaginationPipeline = [
    ...basePipeline,
    {
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
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } }
        ],
      }
    }
  ];

  try {
    // Run both pipelines in parallel
    const [paginationResult, nonPaginationResult,allData] = await Promise.all([
      MenuItems.aggregate(paginationPipeline),
      MenuItems.aggregate(nonPaginationPipeline),
      fetchMenuItems(organizer)
    ]);

    // Process results
    const formattedMenuItems = paginationResult[0]?.menuItems?.map(item => formatUpdate(item)) || [];
    const allMenuItems = nonPaginationResult[0]?.menuItems?.map(item => formatUpdate(item)) || [];
    const allMenuItemsData = allData?.map(item => formatUpdate(item)) || [];
    let meta = calculateMeta(allMenuItemsData);
    meta.count = generateMeta(page, limit, allMenuItems.length);

    return {
      MenuItems: formattedMenuItems,
      meta,
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