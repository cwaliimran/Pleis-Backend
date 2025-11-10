// services/topPromoService.js
const { formatMoreFromOrganizerEventResponse } = require("../events/formatter/eventFormatter");
const topPromoRepo = require("./topPromosRepository");
const mongoose = require("mongoose");

const getTop10Promos = async ({ userLocation, userId, timezone, category, time }) => {
  const topPromos = await topPromoRepo.getTop10Promos(userId, timezone, category, time);
  const processed = topPromos.map(doc => {
    return formatMoreFromOrganizerEventResponse(doc.event, { userLocation, timezone });
  });



  return processed;
};

module.exports = {
  getTop10Promos,
};