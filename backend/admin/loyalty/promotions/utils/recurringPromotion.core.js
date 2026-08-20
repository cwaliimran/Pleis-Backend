const Promotion = require("@PromotionModel");

const HORIZON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// ----------------------------------------
// UTC DATE HELPERS
// ----------------------------------------
const startOfDayUTC = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const addDaysUTC = (d, days) =>
  new Date(d.getTime() + days * DAY_MS);

const diffDaysUTC = (a, b) =>
  Math.floor((startOfDayUTC(b) - startOfDayUTC(a)) / DAY_MS);

// ======================================================
// CRON ENTRY
// ======================================================
const runRecurringPromotionsCron = async () => {
  const now = new Date();
  const horizonDate = addDaysUTC(startOfDayUTC(now), HORIZON_DAYS);

  const templates = await Promotion.find({
    "recurringDetails.isEnabled": true,
    "recurringMeta.isTemplate": true,
    status: "active",
  });

  for (const template of templates) {
    try {
      await processPromotionTemplate(template, horizonDate);
    } catch (err) {
    
    }
  }
};

// ======================================================
// PROCESS TEMPLATE
// ======================================================
const processPromotionTemplate = async (template, horizonDate) => {
  if (!template.startDate) return;

  const existing = await Promotion.find({
    "recurringMeta.parentPromotion": template._id,
    status: { $ne: "deleted" },
  }).select("startDate recurringMeta.occurrenceIndex");

  const existingKeySet = new Set(
    existing.map(p => p.startDate.getTime())
  );

  const lastOccurrence = existing.sort(
    (a, b) => b.recurringMeta.occurrenceIndex - a.recurringMeta.occurrenceIndex
  )[0];

  let nextIndex = lastOccurrence
    ? lastOccurrence.recurringMeta.occurrenceIndex + 1
    : 1;

  const dates = getUpcomingPromotionDates(template, horizonDate);

  for (const date of dates) {
    if (existingKeySet.has(date.getTime())) continue;
    await createPromotionOccurrence(template, date, nextIndex++);
  }
};



// ======================================================
// DATE GENERATION
// ======================================================
const getUpcomingPromotionDates = (template, horizonDate, existingCount) => {
  const rule = template.recurringDetails;

  const baseStart = new Date(template.startDate);
  const baseDay = startOfDayUTC(baseStart);

  const today = startOfDayUTC(new Date());
  let cursor = baseDay > today ? baseDay : today;

  const endDate = rule.endDate
    ? startOfDayUTC(new Date(rule.endDate))
    : null;

  const list = [];
  let generated = existingCount;

  while (cursor <= horizonDate) {

    if (endDate && cursor > endDate) break;

    // DAILY
    if (rule.frequency === "daily") {
      const diff = diffDaysUTC(baseDay, cursor);
      if (diff >= 0 && diff % rule.interval === 0) {
        list.push(startOfDayUTC(cursor));
        generated++;
      }
    }

    // WEEKLY
    if (rule.frequency === "weekly") {
      const diffWeeks = Math.floor(diffDaysUTC(baseDay, cursor) / 7);

      const weekday = cursor
        .toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })
        .toLowerCase()
        .slice(0, 3);

      const allowed =
        !rule.daysOfWeek.length || rule.daysOfWeek.includes(weekday);

      if (diffWeeks >= 0 && diffWeeks % rule.interval === 0 && allowed) {
        list.push(startOfDayUTC(cursor));
        generated++;
      }
    }

    // MONTHLY (simple anchor-based, same as events)
    if (rule.frequency === "monthly") {
      const monthsDiff =
        (cursor.getUTCFullYear() - baseDay.getUTCFullYear()) * 12 +
        (cursor.getUTCMonth() - baseDay.getUTCMonth());

      if (monthsDiff >= 0 && monthsDiff % rule.interval === 0) {
        list.push(startOfDayUTC(cursor));
        generated++;
      }
    }

    cursor = addDaysUTC(cursor, 1);
  }

  return list;
};

// ======================================================
// CREATE OCCURRENCE
// ======================================================
const createPromotionOccurrence = async (template, startDate, index) => {
  const durationMs =
    template.endDate && template.startDate
      ? template.endDate - template.startDate
      : null;

  const clone = template.toObject();
  delete clone._id;
  delete clone.createdAt;
  delete clone.updatedAt;

  clone.startDate = startDate;
  clone.endDate = durationMs
    ? new Date(startDate.getTime() + durationMs)
    : null;

  clone.recurringMeta = {
    isTemplate: false,
    parentPromotion: template._id,
    occurrenceIndex: index,
  };

  // 🔑 IMPORTANT
  clone.recurringDetails = {
    ...clone.recurringDetails,
  };

  await Promotion.create(clone);
};


// ======================================================
// IMMEDIATE GENERATION (ON CREATE)
// ======================================================
const generateImmediatelyForPromotionTemplate = async (templateId) => {
  const template = await Promotion.findOne({
    _id: templateId,
    "recurringMeta.isTemplate": true,
    "recurringDetails.isEnabled": true,
    status: "active",
  });

  if (!template) return;

  const horizonDate = addDaysUTC(startOfDayUTC(new Date()), HORIZON_DAYS);
  await processPromotionTemplate(template, horizonDate);
};

module.exports = {
  runRecurringPromotionsCron,
  generateImmediatelyForPromotionTemplate,
};
