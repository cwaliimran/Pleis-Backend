
/**
 * Pure formatter for item objects (safe for doc or plain object)
 */
function reservationsFormatter(item) {
  if (!item) return null;

  // Handle both Mongoose doc and plain object
  const cat = item.toObject ? item.toObject() : { ...item };

  return {
    ...cat,
  };
}

module.exports = { reservationsFormatter,};



