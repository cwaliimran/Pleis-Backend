const buildMostViewedEvents = (rows = []) => {
  const events = rows.map((r) => ({
    eventId: r.eventId,
    title: r.title || "Unknown",
    totalViews: r.totalViews || 0,
  }));

  return {
    mostViewedEvents: events,
  };
};
module.exports = { buildMostViewedEvents };