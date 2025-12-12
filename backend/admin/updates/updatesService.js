const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const UpdatesRepo = require("./updatesRepository");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createUpdates = async (data) => {
  let Updates = await UpdatesRepo.createUpdates(data);
  return Updates;
};
const getUpdatess = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { updates, meta } = await UpdatesRepo.getUpdatess({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    updates,
    meta
  };
};
const updateUpdates = async (id, data) => {
  const Updates = await UpdatesRepo.findUpdatesById(id);
  if (!Updates) {
    return { error: "Updates_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if(data.discountType){
  if (Updates.discountType !== data.discountType) {
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
    "description",
    "image",
    "status",
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
    return Updates;
  }

const userIds = await UpdatesRepo.getUserIdsForEvent(Updates.event);
  Object.assign(Updates, updateData);

  await Updates.save();

    await sendUserNotifications({
            recipientIds: userIds, 
            title: Updates.title,
            body: `You received a new message: ${Updates.description}`,
            data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
            sender: Updates.companyOrganizer,
            objectId: Updates.event,
          });

  return Updates;
};





  const deleteUpdates = async (id) => {
      const updated = await UpdatesRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };















const getevents = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await UpdatesRepo.getevents({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    events,
    meta
  };
};





module.exports = {
  createUpdates,
  getUpdatess,
  updateUpdates,
  deleteUpdates,
  getevents

};