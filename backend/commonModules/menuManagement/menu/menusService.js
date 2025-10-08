// services/menuService.js
const { buildKeywordQueryFromModels } = require("../../../helperUtils/queryUtil");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const Venues = require("../../venues/Venues");
const Menus = require("./Menus");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate venue data for menus
const getMenus = async ({ page, limit, keyword, status, userId, date, venue }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Join with Venues collection
    {
      $lookup: {
        from: "venues",
        localField: "venue",
        foreignField: "_id",
        as: "venueData"
      }
    },
    // Flatten venueData array for easier matching
    { $unwind: { path: "$venueData", preserveNullAndEmptyArrays: true } },
    // Match user access (menu creator)
    {
      $match: {
        creator: new mongoose.Types.ObjectId(userId)
      }
    }
  ];

  // Apply filters
  if (venue) {
    pipeline.push({
      $match: {
        venue: new mongoose.Types.ObjectId(venue)
      }
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Menus.schema },           // Menu fields
      { schema: Venues.schema, prefix: 'venueData.' } // Venue fields (with prefix)
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await Menus.aggregate(pipeline);

  const menus = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Menus.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Menus.countDocuments({ status: "active", creator: userId }),
    Menus.countDocuments({ status: "inactive", creator: userId })
  ]);

  const formattedMenus = menus.map(menu => {
    const menuDoc = new Menus(menu);
    let formattedMenu = menuDoc.formatResponse ? menuDoc.formatResponse() : menuDoc.toObject();

    // Attach venue data if present
    if (menu.venueData) {
      formattedMenu.venue = Venues.prototype.formatResponse
        ? Venues.prototype.formatResponse(menu.venueData)
        : menu.venueData;
    }

    return formattedMenu;
  });

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menusCount = { total, active, inactive };

  return {
    menus: formattedMenus,
    meta
  };
};


const updateMenu = async (id, data) => {
  const menu = await menuRepo.findMenuById(id);
  if (!menu) return null;

  const allowedFields = [
    "title",
    "description",
    "venue",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menu; // nothing to update
  }

  Object.assign(menu, updateData);
  await menu.save();

  return menu;
};

const deleteMenu = async (id) => {
  const updated = await menuRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getMenuDetails = async (id) => {
  const menu = await menuRepo.findMenuById(id);
  if (!menu) return null;
  return menu;
};


const duplicateMenuAndItems = async (menuId, venue) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 1: Duplicate the Menu
    const menu = await menuRepo.findMenuById(menuId);
    if (!menu) {
      throw new Error('Menu not found');
    }

    if (menu.venue.toString() === venue.toString()) {
      throw new Error('Old and new venue cannot be the same');
    }

    //check if new venue has already a menu with
    const existingMenu = await Menus.findOne({ venue: venue, status: { $ne: 'deleted' } }).session(session);
    if (existingMenu) {
      throw new Error('A menu already exists for this venue');
    }

    const duplicatedMenu = {
      ...menu.toObject(),
      _id: new mongoose.Types.ObjectId(),
      title: `${menu.title}`,  // Optionally append "(Copy)" to the title
      venue: venue,
    };

    const savedDuplicatedMenu = await menuRepo.createDuplicatedMenu(duplicatedMenu, session);

    // Step 2: Duplicate the Menu Items
    const menuItems = await menuRepo.getMenuItemsByMenuId(menu, session);

    const duplicatedMenuItemsPromises = menuItems.map(item => {
      const duplicatedItem = {
        ...item.toObject(),
        _id: new mongoose.Types.ObjectId(),
        menu: savedDuplicatedMenu._id,
      };
      return menuRepo.createDuplicatedMenuItem(duplicatedItem, session);
    });

    await Promise.all(duplicatedMenuItemsPromises);

    await session.commitTransaction();
    session.endSession();

    return savedDuplicatedMenu;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

module.exports = {
  createMenu,
  getMenus,
  updateMenu,
  getMenuDetails,
  duplicateMenuAndItems,
  deleteMenu,
};
