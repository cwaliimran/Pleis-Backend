
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuItems = require("@MenuItemsModel");
const { Events } = require("@EventsModel");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const MenuItemsSale = require("@MenuItemsSaleModel");
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
  organization, // Organization ID to match
}) => {
  // Step 1: Find MenuItems by matching organization in the menu field
  const menuItems = await MenuItems.aggregate([
    // Match by organization linked in the 'menu' field
    {
      $lookup: {
        from: "menus", // Reference to the 'menus' collection
        localField: "menu", // Field in MenuItems
        foreignField: "_id", // Match the _id field in 'menus'
        as: "menuDetails" // The result of the lookup will be saved in menuDetails
      }
    },
    {
      $unwind: "$menuDetails" // Flatten the array to match the first item
    },
    {
      $match: {
        "menuDetails.organization": organization, // Match the organization field in the menuDetails
        status: "active" // Only include active items
      }
    },
    // Select the fields you want to return
    {
      $project: {
        _id: 1,
        title: 1,
        basePrice: 1,
        discountPrice: 1,
        taxPercent: 1
      }
    },
    {
      $skip: skip || (page - 1) * limit // Skip based on pagination
    },
    {
      $limit: limit // Limit the number of results based on pagination
    }
  ]);

  if (!menuItems.length) {
    return {
      message: "Menu fetched successfully",
      data: [],
      meta: generateMeta(page, limit, 0)
    };
  }

  // Step 2: Count the total number of items matching the filters
  const totalFiltered = await MenuItems.aggregate([
    {
      $lookup: {
        from: "menus",
        localField: "menu",
        foreignField: "_id",
        as: "menuDetails"
      }
    },
    {
      $unwind: "$menuDetails"
    },
    {
      $match: {
        "menuDetails.organization": organization,
        status: "active",
        isAvailableInStock: true
      }
    },
    {
      $count: "totalItems"
    }
  ]);

  const totalItems = totalFiltered.length > 0 ? totalFiltered[0].totalItems : 0;

  // Step 3: Return the response with meta and message
  const meta = generateMeta(page, limit, totalItems);

  return {
    MenuItems: menuItems, // MenuItems array
    meta: meta // Pagination metadata
  };
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









const fetchMenuItems = async (organization) => {
  try {
    // Fetch menu items based on the organization in the 'menu' field in MenuItems collection
    const menuItems = await MenuItems.aggregate([
      {
        $lookup: {
          from: "menus", // Reference to the 'menus' collection
          localField: "menu", // Field in MenuItems
          foreignField: "_id", // Match the _id field in 'menus'
          as: "menuDetails" // The result of the lookup will be saved in menuDetails
        }
      },
      {
        $unwind: "$menuDetails" // Unwind the menuDetails array to access organization
      },
      {
        $match: {
          "menuDetails.organization": new mongoose.Types.ObjectId(organization), // Match organization field in menuDetails
          status: "active" // Only active items
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          basePrice: 1,
          discountPrice: 1,
          taxPercent: 1,
          image: 1,
          category: 1,
          startTime: 1,
          endTime: 1,
          availabilityType: 1,
          event: 1,
          isLimitedTimeOffer: 1,
          upSellItem: 1,
          endDate: 1,
          isAvailableInStock: 1,
          startDate: 1,
          isScheduled: 1,
          createdAt: 1
        }
      }
    ]);

    return menuItems;
  } catch (error) {

    return [];
  }
};

const getSummary = async ({
  page,
  limit,
  skip,
  organization, // Organization ID to match
  categoryId,
  eventId,
  keyword,
  filter,
  sortBy,
}) => {
  let basePipeline = [
    {
      $match: {
        status: "active",
      }
    }
  ];

  // Match by organization in the MenuItems collection using $lookup
  basePipeline.push({
    $lookup: {
      from: "menus", // Reference to the 'menus' collection
      localField: "menu", // Field in MenuItems
      foreignField: "_id", // Match the _id field in 'menus'
      pipeline: [
        {
          $project: {
            title: 1,
            organization: 1
          }
        }
      ],

      as: "menu" // The result of the lookup will be saved in menuDetails
    }
  });

  // Unwind to flatten the array of menuDetails
  basePipeline.push({ $unwind: "$menu" });

  // Match the organization field in menuDetails
  if (organization) {
    basePipeline.push({
      $match: { "menu.organization": new mongoose.Types.ObjectId(organization) }
    });
  }

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
              image: 1,
              title: 1,
              description: 1,
              category: 1,
              basePrice: 1,
              discountPrice: 1,
              taxPercent: 1,
              startTime: 1,
              endTime: 1,
              availabilityType: 1,
              event: 1,
              isLimitedTimeOffer: 1,
              upSellItem: 1,
              endDate: 1,
              isAvailableInStock: 1,
              startDate: 1,
              isScheduled: 1,
              createdAt: 1,
              menu: 1,
              status: 1,
              isLimitedTimeOffer: 1,
              startDate: 1,
              endDate: 1,
              isScheduled: 1,
              availabilityType: 1,
              upSellItem: 1,
              isAvailableInStock: 1,
              type: 1





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
              pipeline: [{ $project: { 'basicInfo.title': 1 } }],
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
              image: 1,
              title: 1,
              description: 1,
              category: 1,
              basePrice: 1,
              discountPrice: 1,
              taxPercent: 1,
              startTime: 1,
              endTime: 1,
              availabilityType: 1,
              event: 1,
              isLimitedTimeOffer: 1,
              upSellItem: 1,
              endDate: 1,
              isAvailableInStock: 1,
              startDate: 1,
              isScheduled: 1,
              createdAt: 1
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
              pipeline: [{ $project: { 'basicInfo.title': 1 } }],
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
    const [paginationResult, nonPaginationResult, allData] = await Promise.all([
      MenuItems.aggregate(paginationPipeline),
      MenuItems.aggregate(nonPaginationPipeline),
      fetchMenuItems(organization)
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