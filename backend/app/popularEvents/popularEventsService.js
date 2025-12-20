const { formatMoreFromOrganizerEventResponse } = require("../events/formatter/eventFormatter");
const { formatPopularEventHome } = require("./formatter/formatPopularEventHome");
const popularEventsRepo = require("./popularEventsRepository");
const mongoose = require("mongoose");

const getPopularEventsService = async ({ page = 1, limit = 10, skip = 0, userLocation, userId, timezone, category }) => {
  const { data, meta } = await popularEventsRepo.getPopularEvents(page, limit, skip, userId, timezone, category);
  const processed = data.map(doc => {
    return formatMoreFromOrganizerEventResponse(doc.event, { userLocation, timezone });
  });

  return { data: processed, meta };
};

const getPopularEventsForHomeService = async ({ page = 1, limit = 10, skip = 0, timezone, category }) => {
  const { data } = await popularEventsRepo.getPopularEventsForHome(limit, skip, timezone, category);
  const processed = data.map(doc => {
    return formatPopularEventHome(doc);
  });


  return { data: processed };
};
 

module.exports = {
  getPopularEventsService,
  getPopularEventsForHomeService,
};