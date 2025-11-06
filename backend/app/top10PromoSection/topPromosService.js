// services/topPromoService.js
const { formatMoreFromOrganizerEventResponse } = require("../events/formatter/recommendedEventFormatter");
const topPromoRepo = require("./topPromosRepository");
const mongoose = require("mongoose");

const getTop10Promos = async ({ userLocation, userId, timezone }) => {
  const topPromos = await topPromoRepo.getTop10Promos( userId, timezone);
  const processed = topPromos.map(doc => {
    return formatMoreFromOrganizerEventResponse(doc.event, { userLocation, timezone });
  });



  return processed;
};

module.exports = {
  getTop10Promos,
};