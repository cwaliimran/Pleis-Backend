const { getFullImageUrl } = require("@utils/imageHelper");

function formatImageFields(doc) {
  if (!doc) return doc;
  return { ...doc, image: getFullImageUrl(doc.image) };
}

function formatImageFieldsList(docs = []) {
  return docs.map(formatImageFields);
}

module.exports = { formatImageFields, formatImageFieldsList };
