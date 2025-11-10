const fs = require("fs");
const path = require("path");

// === CONFIG ===
const collectionPath = path.resolve(
  __dirname,
  "Pleis.postman_collection.json"
);
const rolePrefix = "{{url}}organizer/"; // what to prepend

// === LOAD COLLECTION ===
const collection = JSON.parse(fs.readFileSync(collectionPath, "utf8"));

/**
 * Recursively traverse folder items
 */
function updateFolderUrls(items) {
  items.forEach((item) => {
    if (item.item) {
      // folder
      updateFolderUrls(item.item);
    } else if (item.request && item.request.url) {
      const urlObj = item.request.url;

      // Only update if not already includes 'admin/'
      if (
        typeof urlObj.raw === "string" &&
        !urlObj.raw.includes("{{url}}organizer/")
      ) {
        // Update raw URL
        urlObj.raw = urlObj.raw.replace(
          "{{url}}",
          rolePrefix
        );

        // Update host (array form like ["{{url}}auth"])
        if (Array.isArray(urlObj.host)) {
          urlObj.host = urlObj.host.map((h) =>
            h.replace("{{url}}", rolePrefix)
          );
        }

        // Optional: no need to touch path array — only prepend raw
      }
    }
  });
}

// === FIND AND UPDATE ADMIN PANEL ===
const adminFolder = collection.item.find((f) => f.name === "Organizer");
if (adminFolder && adminFolder.item) {
  updateFolderUrls(adminFolder.item);
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
  console.log("✅ Updated all Admin Panel URLs with {{url}}organizer/");
} else {
  console.log("❌ 'Admin Panel' folder not found in collection");
}
