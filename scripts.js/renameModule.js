const fs = require("fs");
const path = require("path");

// ============== CONFIG ==============
const currentDir = "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/commonModules/highlights";

const oldSingular = "Event";
const oldPlural = "Events";
const newSingular = "Highlight";
const newPlural = "Highlights";
// =====================================

// Helpers
const toCamel = (str) => str.charAt(0).toLowerCase() + str.slice(1);
const toPascal = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// Generate replacement rules
function generateReplaceRules(oldSingular, oldPlural, newSingular, newPlural) {
  return [
    // PascalCase
    { from: toPascal(oldPlural), to: toPascal(newPlural) },
    { from: toPascal(oldSingular), to: toPascal(newSingular) },
    // camelCase
    { from: toCamel(oldPlural), to: toCamel(newPlural) },
    { from: toCamel(oldSingular), to: toCamel(newSingular) },
    // lowercase
    { from: oldPlural.toLowerCase(), to: newPlural.toLowerCase() },
    { from: oldSingular.toLowerCase(), to: newSingular.toLowerCase() },
    // UPPERCASE
    { from: oldPlural.toUpperCase(), to: newPlural.toUpperCase() },
    { from: oldSingular.toUpperCase(), to: newSingular.toUpperCase() },
  ];
}

const replaceRules = generateReplaceRules(oldSingular, oldPlural, newSingular, newPlural);

// Smart casing for content replacement
function applyCasing(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original === original.toLowerCase()) return replacement.toLowerCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Force camelCase in filenames
function forceCamelCaseFilename(filename) {
  // Convert PascalCase to camelCase (e.g., VenuetypesController → venueTypesController)
  return filename.replace(/^([A-Z])/, (m) => m.toLowerCase());
}

// Main replacement function
function renameFilesInDirectory(directory) {
  fs.readdirSync(directory).forEach((filename) => {
    const oldFilePath = path.join(directory, filename);
    if (!fs.lstatSync(oldFilePath).isFile()) return;

    // --- Replace content in file ---
    let content = fs.readFileSync(oldFilePath, "utf8");
    replaceRules.forEach(({ from, to }) => {
      const regex = new RegExp(from, "g");
      content = content.replace(regex, (match) => applyCasing(match, to));
    });
    fs.writeFileSync(oldFilePath, content, "utf8");

    // --- Rename file itself ---
    let newFileName = filename;
    replaceRules.forEach(({ from, to }) => {
      const regex = new RegExp(from, "g");
      newFileName = newFileName.replace(regex, to);
    });

    // Ensure final file name is camelCase
    const ext = path.extname(newFileName); // .js
    const baseName = path.basename(newFileName, ext); // e.g., venueTypesService
    const camelCased = forceCamelCaseFilename(baseName) + ext;

    const newFilePath = path.join(directory, camelCased);
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);
    }
  });
}

// Run
renameFilesInDirectory(currentDir);

console.log(`✅ Renamed files and content from ${oldPlural}/${oldSingular} → ${newPlural}/${newSingular}`);
