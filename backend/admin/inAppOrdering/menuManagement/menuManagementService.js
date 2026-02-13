const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const MenuRepo = require("./menuManagementRepository");
const { NotificationTypes } = require("@NotificationsModel");
const MenuItems = require("@MenuItemsModel");
const PresetModel = require("@PresetsModel");
const createSale = async (data) => {

  let Menu = await MenuRepo.createSale(data);
  return Menu;
};
const getMenuItems = async ({ timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,
  range, }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { MenuItems, meta } = await MenuRepo.getMenuItems({
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    date,
    range,
    today,
    skip,
  });

  return {
    MenuItems,
    meta
  };
};
const mongoose = require("mongoose");

const updateMenu = async (id, data) => {
  const order = await MenuRepo.findMenuById(id);

  if (!order) {
    return { error: "Menu_not_found" };
  }

  // ❌ Cannot cancel a paid order
  if (order.paymentStatus === "paid" && data.status === "cancelled") {
    return { error: "Cant_Cancel_paid_order" };
  }

  /* ===============================
     1️⃣ UPDATE ORDER STATUS (OPTIONAL)
  =============================== */
  if (data.status !== undefined) {
    order.status = data.status;
  }

  /* ===============================
     2️⃣ UPDATE PAYMENT STATUS (OPTIONAL)
  =============================== */
  if (data.paymentStatus !== undefined) {
    order.paymentStatus = data.paymentStatus;

    if (data.paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }
  }

  /* ===============================
     3️⃣ DELIVER ALL (HIGHEST PRIORITY)
  =============================== */
  if (typeof data.deliveredall === "boolean") {
    order.items.forEach(item => {
      item.isdelivered = data.deliveredall;
    });
  }

  /* ===============================
     4️⃣ DELIVER SELECTED ITEMS
     (ONLY IF deliveredall NOT SENT)
  =============================== */
  else if (data.deliveredMenuItem) {
    const deliveredIds = data.deliveredMenuItem
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    order.items.forEach(item => {
      if (
        deliveredIds.some(dId => dId.equals(item.menuItem))
      ) {
        item.isdelivered = true;
      }
    });
  }

  await order.save();
  return order;
};



const getEvents = async ({ timezone,
  page,
  limit,
  keyword,
  status,
  organizer,
  date,
  range, }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { MenuItems, meta } = await MenuRepo.getEvents({
    timezone,
    page,
    limit,
    keyword,
    status,
    organizer,
    date,
    range,
    today,
    skip,
  });

  return {
    MenuItems,
    meta
  };
};

const deleteMenu = async (id) => {
  const updated = await MenuRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};















const getevents = async ({ timezone, page, limit, keyword, status, organizationId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await MenuRepo.getevents({ timezone, page, limit, keyword, status, organizationId, date, range, today, skip });

  return {
    events,
    meta
  };
};


const gettickets = async ({ timezone, page, limit, keyword, status, userId, date, range, eventId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { tickets, meta } = await MenuRepo.gettickets({ timezone, page, limit, keyword, status, userId, date, range, today, skip, eventId });

  return {
    tickets,
    meta
  };
};

const getWinners = async ({ timezone, page, limit, keyword, status, userId, date, range, MenuId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { winners, meta } = await MenuRepo.getWinners({ timezone, page, limit, keyword, status, userId, date, range, today, skip, MenuId });

  return {
    winners,
    meta
  };
};









const getMenuItemCategories = async ({ timezone,
  page,
  limit,
  keyword,
  status,

  date,
  range, }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { MenuItems, meta } = await MenuRepo.getMenuItemCategories({
    timezone,
    page,
    limit,
    keyword,
    status,

    date,
    range,
    today,
    skip,
  });

  return {
    MenuItems,
    meta
  };
};





const createLimitedTimeItem = async (data, timezone) => {
  const { menuItems } = data; 
    const menuItemIds = menuItems.map(id =>new mongoose.Types.ObjectId(id));

  const updateData = {};
  if (data.startTime !== undefined) {
    updateData.startTime = data.startTime;
  }

  if (data.endTime !== undefined) {
    updateData.endTime = data.endTime;
  }
    if (data.startDate !== undefined) {
    updateData.startDate = data.startDate;
  }

  if (data.endDate !== undefined) {
    updateData.endDate = data.endDate;
  }

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  if (data.availabilityType !== undefined) {
    updateData.availabilityType = data.availabilityType;
  }
    if (data.isScheduled !== undefined) {
    updateData.isScheduled = data.isScheduled;
  }

  if (data.isLimitedTimeOffer !== undefined) {
    updateData.isLimitedTimeOffer = data.isLimitedTimeOffer;
  }

  if (data.event !== undefined) {
    updateData.event = data.event;
  }

  if (data.upSellItem !== undefined) {
    updateData.upSellItem = data.upSellItem;
  }

  try {
    // Use updateMany to update all menu items in a single query
    const result = await MenuItems.updateMany(
      { "_id": { $in: menuItemIds } },  // Match menu items by their IDs
      { $set: updateData },            // Set the new values
      { multi: true }                  // Ensure multiple documents can be updated
    );

    if (result.nModified === 0) {
      return sendResponse({
        statusCode: 404,
        translationKey: "menu_items_not_found",
        error: "No menu items were updated",
      });
    }


    return result
  } catch (error) {
    return { error: "Error_updating_menu_items"
  }
};
};

const createMenuItemFromPreset = async (data, timezone) => {
  const { preSets, menuId } = data;

  // Ensure preSets is an array of IDs
  const presetIds = preSets.map(id => mongoose.Types.ObjectId(id));

  try {
    const presetsData = await PresetModel.find({
      '_id': { $in: presetIds }, 
    });

    // If no presets are found
    if (presetsData.length === 0) {
      return { error: "No presets found with the provided IDs" };
    }

    // Create an array of new menu items using the fetched preset data
    const menuItemsData = presetsData.map(preset => {
      return {
        image: preset.image || "",  // Default image if not available
        title: preset.title || "",
        description: preset.description || "",
        basePrice: preset.basePrice || 0,
        category: preset.category,  // Assuming category is a valid ObjectId
        menu: menuId,               // Use provided menuId for all items
        status: "active",           // Default status
        isLimitedTimeOffer: preset.isLimitedTimeOffer || false,
        startDate: preset.startDate || null,
        endDate: preset.endDate || null,
        event: preset.event || null,
        availabilityType: preset.availabilityType || null,
        upSellItem: preset.upSellItem || false,
        isAvailableInStock: preset.isAvailableInStock || true,
        // You can add any additional fields here as needed
      };
    });

    // Insert the new menu items into the database
    const createdMenuItems = await MenuItems.insertMany(menuItemsData);

    // Return success response
    return createdMenuItems;

  } catch (error) {

    return { error: "Error creating menu items from preset: " + error.message };
  }
};

const getSummary = async ({ timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,filter,sortBy,categoryId,
  range, }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { MenuItems, meta } = await MenuRepo.getSummary({
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    date,
    range,
    today,
    skip,filter,sortBy,categoryId
  }); 

  return {
    MenuItems,
    meta,
  };
};
const getSaleItems = async ({ timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,filter,sortBy,categoryId,
  range, }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { data, meta } = await MenuRepo.getMenuItemsSales({
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    date,
    range,
    today,
    skip,filter,sortBy,categoryId
  }); 

  return {
   data,
    meta,
  };
};

module.exports = {
  createSale,
  getMenuItems,
  updateMenu,
  deleteMenu,
  getevents,
  gettickets,
  getWinners,
  getMenuItemCategories,
  getEvents,
  createLimitedTimeItem,
  createMenuItemFromPreset,
  getSummary,
  getSaleItems

};