const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const NotificationsRepo = require("./notificationsRepository");


const createNotifications = async (data) => {
  let globalNotification = await NotificationsRepo.createNotifications(data);
  return globalNotification;
};
const getNotificationss = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Notificationss, meta } = await NotificationsRepo.getNotificationss({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    Notificationss,
    meta
  };
};
const updateNotifications = async (id, data) => {
  const Notifications = await NotificationsRepo.findNotificationsById(id);
  if (!Notifications) {
    return { error: "Notifications_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if (data.discountType) {
    if (Notifications.discountType !== data.discountType) {
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
    "Notifications",
    "description",
    "discountType",
    "discountValue",
    "status",
    "maxDiscountCap",
    "maxCountPerUser",
    "expiryDate",
    "maxUsage",
  ];

  if (data.expiryDate == "Invalid date") {
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
  console.log("updateData", updateData);
  if (Object.keys(updateData).length === 0) {
    return Notifications;
  }

  Object.assign(Notifications, updateData);
  await Notifications.save();

  return Notifications;
};





const deleteNotifications = async (id) => {
  const updated = await NotificationsRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};











const getOrganizations = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { organizations, meta } = await NotificationsRepo.getOrganizations({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    organizations,
    meta
  };
};


const getEvents = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await NotificationsRepo.getEvents({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    events,
    meta
  };
};


const gettags = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await NotificationsRepo.gettags({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    events,
    meta
  };
};


module.exports = {
  createNotifications,
  getNotificationss,
  updateNotifications,
  deleteNotifications,
  getOrganizations,
  getEvents,
  gettags
};