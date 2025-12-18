const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const GiveawayRepo = require("./giveawayRepository");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createGiveaway = async (data) => {
  let Giveaway = await GiveawayRepo.createGiveaway(data);
  return Giveaway;
};
const getGiveaway = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Giveaways, meta } = await GiveawayRepo.getGiveaway({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    Giveaways,
    meta
  };
};
const updateGiveaway = async (id, data) => {
  const Giveaway = await GiveawayRepo.findGiveawayById(id);
  if (!Giveaway) {
    return { error: "Giveaway_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if(data.discountType){
  if (Giveaway.discountType !== data.discountType) {
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
    "giveawayStatus"
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
    return Giveaway;
  }

// const userIds = await GiveawayRepo.getUserIdsForEvent(Giveaway.event);
  Object.assign(Giveaway, updateData);

  await Giveaway.save();

    // await sendUserNotifications({
    //         recipientIds: userIds, 
    //         title: Giveaway.title,
    //         body: `You received a new message: ${Giveaway.description}`,
    //         data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
    //         sender: Giveaway.companyOrganizer,
    //         objectId: Giveaway.event,
    //       });

  return Giveaway;
};





  const deleteGiveaway = async (id) => {
      const updated = await GiveawayRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };















const getevents = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { events, meta } = await GiveawayRepo.getevents({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    events,
    meta
  };
};


const gettickets = async ({ timezone, page, limit, keyword, status, userId,  date, range,eventId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { tickets, meta } = await GiveawayRepo.gettickets({ timezone, page, limit, keyword, status, userId,  date, range, today, skip, eventId });

  return {
    tickets,
    meta
  };
};



module.exports = {
  createGiveaway,
  getGiveaway,
  updateGiveaway,
  deleteGiveaway,
  getevents,
  gettickets

};