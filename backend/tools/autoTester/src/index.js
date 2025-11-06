const path = require("path");
const fs = require("fs");
const { parseRoutesRecursively } = require("./parseRoutesRecursively");

const START_FILE = path.resolve(__dirname, "../../../server.js");
const OUTPUT_FILE = path.resolve(__dirname, "../routesMap.json");

(async () => {
  console.log("🔍 Scanning routes starting from:", START_FILE);

  try {
    const result = await parseRoutesRecursively(START_FILE, "/api/v1");
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log("✅ Route mapping complete. Output saved to", OUTPUT_FILE);
  } catch (err) {
    console.error("❌ Failed to parse routes:", err);
  }
})();
