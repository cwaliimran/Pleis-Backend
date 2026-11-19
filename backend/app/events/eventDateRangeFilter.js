/**
 * Date range from the guest filter sheet (advanceFilters.dateFrom / dateTo,
 * "YYYY-MM-DD"). The event must sit fully inside the range: it starts on or
 * after dateFrom and ends by the end of dateTo. Returns {} when no range.
 */
function eventDateRangeQuery(advanceFilters = {}) {
  const { dateFrom, dateTo } = advanceFilters || {};
  const start = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null;
  const end = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;
  const valid = (d) => d && !Number.isNaN(d.getTime());

  const query = {};
  if (valid(start)) query["schedule.startDateTime"] = { $gte: start };
  if (valid(end)) query["schedule.endDateTime"] = { $lte: end };
  return query;
}

module.exports = { eventDateRangeQuery };
