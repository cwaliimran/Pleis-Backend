const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createOrders = async (data) => {

  let Orders = await OrdersRepo.createOrders(data);
  return Orders;
};
const getOrders = async ({ activeorderStatus, pickupFilter, orderStatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Orderss, meta } = await OrdersRepo.getOrders({ activeorderStatus, pickupFilter, orderStatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range, today, skip });

  return {
    Orderss,
    meta
  };
};
const mongoose = require("mongoose");

const updateOrders = async (id, data) => {
  const order = await OrdersRepo.findOrdersById(id);

  if (!order) {
    return { error: "Orders_not_found" };
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





const deleteOrders = async (id) => {
  const updated = await OrdersRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};















const getevents = async ({ timezone, page, limit, keyword, status, organizationId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await OrdersRepo.getevents({ timezone, page, limit, keyword, status, organizationId, date, range, today, skip });

  return {
    events,
    meta
  };
};


const gettickets = async ({ timezone, page, limit, keyword, status, userId, date, range, eventId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { tickets, meta } = await OrdersRepo.gettickets({ timezone, page, limit, keyword, status, userId, date, range, today, skip, eventId });

  return {
    tickets,
    meta
  };
};

const getWinners = async ({ timezone, page, limit, keyword, status, userId, date, range, OrdersId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { winners, meta } = await OrdersRepo.getWinners({ timezone, page, limit, keyword, status, userId, date, range, today, skip, OrdersId });

  return {
    winners,
    meta
  };
};

module.exports = {
  createOrders,
  getOrders,
  updateOrders,
  deleteOrders,
  getevents,
  gettickets,
  getWinners

};