const fs = require('fs');
const path = require('path');

// Target directory (or passed via CLI)
const targetDir = process.argv[2] || "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/userWalletService/global/walletTransactions";

if (!fs.existsSync(targetDir)) {
  console.error("Directory does not exist:", targetDir);
  process.exit(1);
}

// Text/code extensions only (prevents binary corruption)
const TEXT_EXTENSIONS = [
  ".js", ".ts", ".json", ".txt", ".md", ".yml", ".yaml", ".env"
];

const outputFile = path.join(targetDir, "combined.txt");

// Read directory
const files = fs.readdirSync(targetDir).filter(file => {
  const fullPath = path.join(targetDir, file);

  // Skip directories entirely
  if (fs.statSync(fullPath).isDirectory()) {
    return false;
  }

  // Skip output file itself
  if (file === "combined.txt") {
    return false;
  }

  // Include only known text/code files
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXTENSIONS.includes(ext);
});

let combined = "";

files.forEach(file => {
  const fullPath = path.join(targetDir, file);
  const content = fs.readFileSync(fullPath, "utf8");

  combined += `\n\n/* ============================
   File: ${file}
============================ */\n\n`;

  combined += content + "\n";
});

// Write output
fs.writeFileSync(outputFile, combined.trim(), "utf8");

console.log(`Combined ${files.length} files into: ${outputFile}`);
