// repositories/eventRepository.js
const { Events } = require("@EventsModel");
const TicketingsModel = require("@TicketingsModel");
const { getModelCounts, } = require('@dbUtils/queryUtil');


const createEvent = async (data, ticketingData) => {
  const session = await Events.startSession();
  session.startTransaction();

  try {
    const isAvailable = await isEventStartTimeAvailableForOrganization({
      organizationId: data.basicInfo.organization,
      startDateTime: data.schedule.startDateTime,
    });

    if (!isAvailable) {
      throw new Error(
        "Another event already exists for this organization at the same start time"
      );
    }

    let event = new Events(data);
    event = await event.save({ session });

    if (ticketingData) {
      ticketingData.event = event._id;

      if (data.recurringMeta?.isTemplate) {
        ticketingData.recurringMeta = {
          isTemplate: true,
          parentTicket: null,
          occurrenceIndex: 1,
        };
      }

      const ticketing = new TicketingsModel(ticketingData);
      await ticketing.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    return event;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};




// Get all with filters
const getEventsWithFilters = async (query, skip, limit) => {
  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description")
    .populate("basicInfo.partnerOrganization", "basicInfo.name basicInfo.media otherInfo.description")
    .sort({ "schedule.startDateTime": -1 })
    .skip(skip)
    .limit(limit);
};
// Get all with filters
const getMinimalEventsWithFilters = async (query) => {
  console.log("query", query);
  return Events.find(query).select("basicInfo.title schedule")
    .sort({ createdAt: -1 })
};



const getEventsCounts = async (query) => {
  return getModelCounts({ model: Events, filterQuery: query });
}

// Count by condition
const countEvents = async (query = {}) => {
  return Events.countDocuments(query);
};

// Find by ID
const findEventById = async (id) => {
  return Events.findById(id)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image otherInfo")
    .populate("basicInfo.tags", "title otherInfo")
    .populate({
      path: "basicInfo.organization",
      select: "basicInfo otherInfo operatingHours",
      populate: [
        {
          path: "otherInfo.categories",
          select: "title image otherInfo",
        },
        {
          path: "otherInfo.tags",
          select: "title otherInfo",
        },
      ],
    })
    .populate({
      path: "basicInfo.partnerOrganization",
      select: "basicInfo.name otherInfo.description basicInfo.media.logo",
    });
};

// Delete
const deleteEventById = async (event) => {
  return await event.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Events.findByIdAndUpdate(id, { $set: data }, { new: true });
};

// Aggregate pipeline
const aggregateEvents = async (pipeline) => {
  return Events.aggregate(pipeline)
    .option({ allowDiskUse: true }) // Optional: helpful for large datasets
    .exec();
};

const updateMany = async (filter, update) => {
  return Events.updateMany(filter, update);
};

const findEventByNanoid = async (nanoid) => {
  return Events.findOne({ publicId: nanoid }).select("_id");
}

const getEventIdsByOrganization = async (organization) => {
  return Events.find({ "basicInfo.organization": organization }).select("_id");
}
/**
 * Checks whether an organization already has an event
 * at the same startDateTime (excluding deleted events)
 *
 * @returns {boolean} true if available, false if conflict exists
 */
const isEventStartTimeAvailableForOrganization = async ({
  organizationId,
  startDateTime,
  excludeEventId = null,
}) => {
  const query = {
    "basicInfo.organization": organizationId,
    "schedule.startDateTime": startDateTime,
    status: { $ne: "deleted" },
  };

  if (excludeEventId) {
    query._id = { $ne: excludeEventId };
  }

  const existingEvent = await Events.findOne(query).select("_id");

  return !existingEvent;
};


module.exports = {
  createEvent,
  getEventsWithFilters,
  countEvents,
  aggregateEvents,
  findEventById,
  deleteEventById,
  findByIdAndUpdate,
  updateMany,
  findEventByNanoid,
  getEventsCounts,
  getMinimalEventsWithFilters,
  getEventIdsByOrganization,
  
};
