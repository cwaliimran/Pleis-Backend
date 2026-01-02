const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const MenuRepo = require("./menuManagementRepository");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createMenu = async (data) => {

  let Menu = await MenuRepo.createMenu(data);
  return Menu;
};
const getMenu = async ({ activeMenutatus, pickupFilter, Menutatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Menus, meta } = await MenuRepo.getMenu({ activeMenutatus, pickupFilter, Menutatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range, today, skip });

  return {
    Menus,
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

module.exports = {
  createMenu,
  getMenu,
  updateMenu,
  deleteMenu,
  getevents,
  gettickets,
  getWinners

};