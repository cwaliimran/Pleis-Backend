const fs = require("fs");
const path = require("path");

// Target directory (CLI arg or fallback)
const targetDir =
  process.argv[2] ||
  "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/staff/organizations";

if (!fs.existsSync(targetDir)) {
  console.error("Directory does not exist:", targetDir);
  process.exit(1);
}

// Allowed text/code extensions
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".json",
  ".txt",
  ".md",
  ".yml",
  ".yaml",
  ".env",
]);

// Folders to ignore
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".idea",
  ".vscode",
]);

//use folder name instead of "combined.txt"
// save at /Users/s/Downloads following folder name
const outputFile = path.join("/Users/s/Downloads", path.basename(targetDir) + ".txt");
let combined = "";
let fileCount = 0;

/**
 * Recursively walk directories and collect files
 */
function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip ignored directories
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkDir(fullPath);
      continue;
    }

    // Skip output file itself
    if (fullPath === outputFile) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      console.warn("Skipped unreadable file:", fullPath);
      continue;
    }

    const relativePath = path.relative(targetDir, fullPath);

    combined += `
/* ============================
   File: ${relativePath}
============================ */
${content}
`;

    fileCount++;
  }
}

// Execute
walkDir(targetDir);

// Write output
fs.writeFileSync(outputFile, combined.trim(), "utf8");

console.log(`Combined ${fileCount} files into: ${outputFile}`);
