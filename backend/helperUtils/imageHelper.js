
function getFullImageUrl(imagePath, baseUrl = process.env.AZURE_STORAGE_BASE_URL || "") {
  if (imagePath && !imagePath.startsWith("http")) {
    return baseUrl + imagePath;
  }
  return imagePath || baseUrl + "noimage.png";
}

module.exports = { getFullImageUrl };
