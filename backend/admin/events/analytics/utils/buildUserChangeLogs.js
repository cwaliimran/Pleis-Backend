const { getFullImageUrl } = require("@utils/imageHelper");

const buildUserChangeLogs = (rows = [], baseImageUrl = "") => {
  const buildSection = (items = []) => {
    if (!items.length) return [];

    return items.map(item => {
      // Enrich the profile image for the changedByUser inside changeLogs
      if (item.reservation && item.reservation.changeLogs) {
        item.reservation.changeLogs.forEach(change => {
          if (change.changedBy && change.changedBy.profileIcon) {
            change.changedBy.profileIcon = getFullImageUrl(change.changedBy.profileIcon);
          }
        });
      }

      return item;
    });
  };

  return buildSection(rows); // This processes all rows
};

module.exports = { buildUserChangeLogs };