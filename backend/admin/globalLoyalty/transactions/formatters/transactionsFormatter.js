const formatTransaction = (item, options = {}) => {
  if (!item) return null;

  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  const { timezone = "UTC" } = options;

  // Replace points object with total points only
  if (obj.points && typeof obj.points === "object") {
    obj.points = obj.points.total || 0;
  }

  // Remove closingBalance entirely
  delete obj.closingBalance;
   delete obj.objectId;
      delete obj.__v;
      delete obj.updatedAt;

  return obj;
};



module.exports = { formatTransaction };
