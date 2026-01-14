const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const mongoose = require("mongoose");
const Menus = require("@MenusModel");



const getOrders = async ({
  activeorderStatus,
  pickupFilter,
  orderStatus,
  activeKeyword,
  timezone,
  page,
  limit,
  keyword,
  status,
  organizationId,
  date,
  range
}) => {
  page = Number(page) || 1;
  limit = Number(limit);


  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });

  let { Orderss, meta } = await OrdersRepo.getOrders({
    activeorderStatus,
    pickupFilter,
    orderStatus,
    activeKeyword,
    timezone,
    page,
    limit,
    keyword,
    status,
    organizationId,
    date,
    range,
    today,
    skip
  });

  return { Orderss, meta };
};


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










const updateInAppOrders = async (companyOrganizer, isOrderingEnabled) => {
  try {
    const result = await Menus.updateMany(
      { creator: companyOrganizer },
      { $set: { isOrderingEnabled } }
    );

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    }
  } catch (error) {
    console.error("updateInAppOrders error:", error);
    return ({
      message: "Something went wrong",
      error: error.message,
    });
  }
};






const getInAppOrders = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  creator,
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });

  let data = await OrdersRepo.getInAppOrders({
    timezone,
    page,
    limit,
    keyword,
    status,
    creator,
    today,
    skip
  });

  return data;
};





module.exports = {
  getOrders,
  updateInAppOrders,
  updateOrders,
  getInAppOrders

};