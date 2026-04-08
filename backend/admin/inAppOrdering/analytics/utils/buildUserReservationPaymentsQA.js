const { getFullImageUrl } = require("@utils/imageHelper");

const buildUserReservationPaymentsQA = (rows = [], baseImageUrl = "") => {
  const buildSection = (items = []) => {
    if (!items.length) return [];

    return items.map(item => {
      // Enrich the user profile image
      if (item.user && item.user.profileIcon) {
        item.user.profileIcon = getFullImageUrl(item.user.profileIcon);
      }

      // Enrich the profile image for the changedByUser inside reservationChanges
      if (item.reservation && item.reservation.reservationChanges) {
        item.reservation.reservationChanges.forEach(change => {
          if (change.changedByUser && change.changedByUser.profileIcon) {
            change.changedByUser.profileIcon = getFullImageUrl(change.changedByUser.profileIcon);
          }
        });
      }

      return item;
    });
  };

  return buildSection(rows); // Can use it for any other fields if needed
};

module.exports = { buildUserReservationPaymentsQA };