const calculateMeta = (data) => {
  const meta = {
    totalMenuItems: 0,
    inStock: 0,
    outOfStock: 0,
    limitedTimeItems: 0,
    upSellItems: 0,
    scheduledItems: 0
  };

  // Iterate through the data to calculate the meta counts
  data.forEach(item => {
    meta.totalMenuItems += 1;

    if (item.isAvailableInStock) {
      meta.inStock += 1;
    } else {
      meta.outOfStock += 1;
    }

    if (item.isLimitedTimeOffer) {
      meta.limitedTimeItems += 1;
    }

    if (item.upSellItem) {
      meta.upSellItems += 1;
    }

    if (item.isScheduled) {
      meta.scheduledItems += 1;
    }
  });

  return meta;
};

function formatUpdate(Update) {
  if (!Update) return null;

  // Handle both Mongoose doc and plain object
  const cat = Update.toObject ? Update.toObject() : { ...Update };

  return {
    ...cat,
    image: getFullImageUrl(cat.image || "noimage.png"),
  };
}

module.exports = {
  calculateMeta,
  formatUpdate
};