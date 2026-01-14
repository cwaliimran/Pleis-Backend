const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Pure formatter for club collaboration objects (safe for doc or plain object)
 */
function formatClubCollaboration(item) {
  if (!item) return null;

  const obj = item.toObject?.() || item;

  // Append only the icons (do not touch any other field)
  if (obj.sender?.user) {
    obj.sender.user.profileIcon = getFullImageUrl(
      obj.sender.user.profileIcon || "noimage.png"
    );
  }

  if (obj.receiver?.user) {
    obj.receiver.user.profileIcon = getFullImageUrl(
      obj.receiver.user.profileIcon || "noimage.png"
    );
  }

  return obj;
}


/**
 * Safe formatter for arrays of club collaborations
 */
function formatClubCollaborations(clubCollaborations = []) {
  return clubCollaborations.map(formatClubCollaboration);
}

module.exports = { formatClubCollaboration, formatClubCollaborations };