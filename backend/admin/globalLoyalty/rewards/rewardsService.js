const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./rewardsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatData = require("./utils/formatReward");
const BaseReward = require("@GlobalLoyaltyReward");
const TicketingsModel = require("@TicketingsModel");

/**
 * When the selected ticket has timingSlots.enabled, admin must pick a timeSlot
 * at reward create/update. Users only claim — they never choose a slot.
 */
const assertTicketTimeSlotConfigured = async (data) => {
  const rewardType = data.rewardType || data.globalRewardType;
  if (rewardType !== "globalTicketReward") return;

  const ticketId = data.ticket;
  if (!ticketId) return;

  const ticket = await TicketingsModel.findById(ticketId).lean();
  if (!ticket) {
    throw Object.assign(new Error("ticket_not_found"), { statusCode: 400 });
  }

  if (!ticket.timingSlots?.enabled) {
    // Clear stale slot if ticket no longer uses slots
    if (data.timeSlot === undefined) data.timeSlot = null;
    return;
  }

  const timeSlot = data.timeSlot || data.timeslot;
  if (!timeSlot) {
    throw Object.assign(new Error("time_slot_required_for_ticket_reward"), {
      statusCode: 400,
    });
  }

  const slotIds = (ticket.timingSlots.dateTimeSlots || []).flatMap((day) =>
    (day.timeSlots || []).map((s) => String(s._id))
  );

  if (!slotIds.includes(String(timeSlot))) {
    throw Object.assign(new Error("invalid_time_slot_for_ticket"), {
      statusCode: 400,
    });
  }

  // Normalize casing
  data.timeSlot = String(timeSlot);
  delete data.timeslot;
};

const create = async (data) => {
  await assertTicketTimeSlotConfigured(data);
  return await repository.create(data);
};

const get = async ({ page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {};

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: BaseReward.schema }],
      keyword
    );
    Object.assign(query, keywordMatch);
  }

  // Fetch rewards and filtered count in parallel
  const [records, totalFiltered] = await Promise.all([
    repository.getWithFilters(query, skip, limit),
    BaseReward.countDocuments(query),
  ]);

  // Summary counts (companyOrganizer removed)
  const [total, active, inactive] = await Promise.all([
    BaseReward.countDocuments({ status: { $ne: "deleted" } }),
    BaseReward.countDocuments({ status: "active" }),
    BaseReward.countDocuments({ status: "inactive" }),
  ]);

  // Meta
  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };

  // Format output
  const formatted = records.map(item => formatData(item, timezone));

  return { responses: formatted, meta };
};


const update = async (id, data) => {
  let item = await repository.findById(id);
  if (!item) return null;

  const merged = {
    rewardType: data.globalRewardType || data.rewardType || item.rewardType,
    ticket: data.ticket !== undefined ? data.ticket : item.ticket,
    timeSlot: data.timeSlot !== undefined ? data.timeSlot : item.timeSlot,
  };
  await assertTicketTimeSlotConfigured(merged);
  if (merged.timeSlot !== undefined) data.timeSlot = merged.timeSlot;

  Object.assign(item, data);
  await item.save();
  //fetch updated item and return
  item = await getDetails(id);
  return item;
};

const deleteItem = async (id) => {
  const updated = await repository.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getDetails = async (id) => {
  let item = await repository.findById(id);
  //format item
  if (item) {
    item = formatData(item.toObject());
  }
  return item;
};

module.exports = {
  create,
  get,
  update,
  getDetails,
  deleteItem,
};
