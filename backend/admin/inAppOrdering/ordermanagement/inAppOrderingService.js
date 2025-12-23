const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createOrders = async (data) => {

  let Orders = await OrdersRepo.createOrders(data);
  return Orders;
};
const getOrders = async ({activeorderStatus,pickupFilter, orderStatus,activeKeyword,timezone, page, limit, keyword, status, organizationId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Orderss, meta } = await OrdersRepo.getOrders({activeorderStatus, pickupFilter, orderStatus,activeKeyword, timezone, page, limit, keyword, status, organizationId,  date, range, today, skip });

  return {
    Orderss,
    meta
  };
};
const updateOrders = async (id, data) => {
  const Orders = await OrdersRepo.findOrdersById(id);
  if (!Orders) {
    return { error: "Orders_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if(data.discountType){
  if (Orders.discountType !== data.discountType) {
      if (!data.discountValue) {
        return { error: "discountValue_is_required_when_discountType_changes" };
  }
}
}

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "title",
    "event",
    "ticketsPerWinner",
    "organization",
    "status",
    "numberOfWinners",
    "endDateTime",
    "ticket",
    "OrdersStatus"
  ];

if(data.expiryDate=="Invalid date"){
    delete data.expiryDate;
}

  // -----------------------------
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Orders;
  }

// const userIds = await OrdersRepo.getUserIdsForEvent(Orders.event);
  Object.assign(Orders, updateData);

  await Orders.save();


  return Orders;
};





  const deleteOrders = async (id) => {
      const updated = await OrdersRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };















const getevents = async ({ timezone, page, limit, keyword, status, organizationId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await OrdersRepo.getevents({ timezone, page, limit, keyword, status, organizationId,  date, range, today, skip });

  return {
    events,
    meta
  };
};


const gettickets = async ({ timezone, page, limit, keyword, status, userId,  date, range,eventId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { tickets, meta } = await OrdersRepo.gettickets({ timezone, page, limit, keyword, status, userId,  date, range, today, skip, eventId });

  return {
    tickets,
    meta
  };
};

const getWinners = async ({ timezone, page, limit, keyword, status, userId,  date, range, OrdersId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { winners, meta } = await OrdersRepo.getWinners({ timezone, page, limit, keyword, status, userId,  date, range, today, skip, OrdersId });

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