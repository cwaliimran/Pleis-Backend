const fs = require("fs");
const path = require("path");

// ============== CONFIG ==============
const currentDir = "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/bookings/ticketings"; // Directory to process

const oldSingular = "Bundle";
const oldPlural = "Bundles";
const newSingular = "TicketingBooking";
const newPlural = "TicketingBookings";
// =====================================

// Helper to convert to different cases
function toCases(word) {
  return {
    original: word,
    lower: word.toLowerCase(),
    upper: word.toUpperCase(),
    pascal: word.charAt(0).toUpperCase() + word.slice(1),
    camel: word.charAt(0).toLowerCase() + word.slice(1),
    snake: word.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') // camelCase to snake_case
  };
}

// Create comprehensive replacement map - CRITICAL: Process LONGEST strings first
function createReplacementMap() {
  const oldSingCases = toCases(oldSingular);
  const oldPlurCases = toCases(oldPlural);
  const newSingCases = toCases(newSingular);
  const newPlurCases = toCases(newPlural);
  
  // Return array sorted by length DESC to prevent partial replacements
  return [
    // PLURALS FIRST (longer strings)
    { from: oldPlurCases.pascal, to: newPlurCases.pascal },  // Menus → MenuItems
    { from: oldPlurCases.camel, to: newPlurCases.camel },    // menus → menuItems  
    { from: oldPlurCases.lower, to: newPlurCases.lower },    // menus → menuitems
    { from: oldPlurCases.upper, to: newPlurCases.upper },    // MENUS → MENUITEMS
    { from: oldPlurCases.snake, to: newPlurCases.snake },    // menus → menu_items (for translation keys)
    { from: oldPlurCases.original, to: newPlurCases.original }, // Menus → MenuItems (fallback)
    
    // SINGULARS SECOND (shorter strings)
    { from: oldSingCases.pascal, to: newSingCases.pascal },  // Menu → MenuItem
    { from: oldSingCases.camel, to: newSingCases.camel },    // menu → menuItem
    { from: oldSingCases.lower, to: newSingCases.lower },    // menu → menuitem  
    { from: oldSingCases.upper, to: newSingCases.upper },    // MENU → MENUITEM
    { from: oldSingCases.snake, to: newSingCases.snake },    // menu → menu_item (for translation keys)
    { from: oldSingCases.original, to: newSingCases.original }, // Menu → MenuItem (fallback)
  ].filter((item, index, arr) => {
    // Remove duplicates while preserving order
    return arr.findIndex(x => x.from === item.from) === index;
  }).sort((a, b) => b.from.length - a.from.length); // Sort by length DESC
}

// Replace text using exact string replacement (not regex) to avoid word boundary issues
function replaceText(text, replacements) {
  let result = text;
  
  // First handle special translation key patterns
  result = handleTranslationKeys(result);
  
  replacements.forEach(({ from, to }) => {
    if (!from || !to || from === to) return;
    result = result.split(from).join(to);
  });
  
  return result;
}

// Special handler for translation keys to convert camelCase to snake_case
function handleTranslationKeys(text) {
  const oldSingCases = toCases(oldSingular);
  const oldPlurCases = toCases(oldPlural);
  const newSingCases = toCases(newSingular);
  const newPlurCases = toCases(newPlural);
  
  let result = text;
  
  // Handle translation key patterns - convert camelCase words to snake_case inside quotes
  const translationKeyPatterns = [
    // Plural patterns in translation keys
    { from: `"${oldPlurCases.camel}_`, to: `"${newPlurCases.snake}_` },      // "menus_ → "menu_items_
    { from: `"${oldPlurCases.pascal}_`, to: `"${newPlurCases.snake}_` },     // "Menus_ → "menu_items_
    { from: `"${oldPlurCases.lower}_`, to: `"${newPlurCases.snake}_` },      // "menus_ → "menu_items_
    
    // Singular patterns in translation keys  
    { from: `"${oldSingCases.camel}_`, to: `"${newSingCases.snake}_` },      // "menu_ → "menu_item_
    { from: `"${oldSingCases.pascal}_`, to: `"${newSingCases.snake}_` },     // "Menu_ → "menu_item_
    { from: `"${oldSingCases.lower}_`, to: `"${newSingCases.snake}_` },      // "menu_ → "menu_item_
  ];
  
  translationKeyPatterns.forEach(({ from, to }) => {
    while (result.includes(from)) {
      result = result.split(from).join(to);
    }
  });
  
  return result;
}

// Special handling for filenames to ensure proper camelCase
function processFilename(filename, replacements) {
  let newFilename = replaceText(filename, replacements);
  
  // Ensure camelCase for the basename
  const ext = path.extname(newFilename);
  const basename = path.basename(newFilename, ext);
  
  // Convert first letter to lowercase if it's uppercase (PascalCase → camelCase)
  const camelCaseBasename = basename.charAt(0).toLowerCase() + basename.slice(1);
  
  return camelCaseBasename + ext;
}

// Main processing function
function processDirectory() {
  const replacements = createReplacementMap();
  
  console.log('🔄 Replacement Map (in processing order):');
  replacements.forEach((r, i) => {
    console.log(`   ${i + 1}. "${r.from}" → "${r.to}"`);
  });
  console.log('');
  
  if (!fs.existsSync(currentDir)) {
    console.log(`❌ Directory not found: ${currentDir}`);
    return;
  }
  
  const files = fs.readdirSync(currentDir).filter(f => 
    fs.statSync(path.join(currentDir, f)).isFile()
  );
  
  console.log(`📁 Processing ${files.length} files in: ${currentDir}\n`);
  
  files.forEach(filename => {
    console.log(`📄 Processing: ${filename}`);
    const filePath = path.join(currentDir, filename);
    
    try {
      // 1. Process file content
      const originalContent = fs.readFileSync(filePath, 'utf8');
      const newContent = replaceText(originalContent, replacements);
      
      if (originalContent !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`   ✏️  Content updated`);
        
        // Show sample of changes (first few lines that changed)
        const originalLines = originalContent.split('\n');
        const newLines = newContent.split('\n');
        let changesShown = 0;
        
        for (let i = 0; i < Math.min(originalLines.length, newLines.length) && changesShown < 3; i++) {
          if (originalLines[i] !== newLines[i] && originalLines[i].trim() && newLines[i].trim()) {
            console.log(`      📝 Line ${i + 1}: "${originalLines[i].trim()}" → "${newLines[i].trim()}"`);
            changesShown++;
          }
        }
      } else {
        console.log(`   ➖ No content changes needed`);
      }
      
      // 2. Process filename  
      const newFilename = processFilename(filename, replacements);
      
      if (filename !== newFilename) {
        const newFilePath = path.join(currentDir, newFilename);
        fs.renameSync(filePath, newFilePath);
        console.log(`   📁 Renamed: ${filename} → ${newFilename}`);
      } else {
        console.log(`   ➖ No filename changes needed`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  });
  
  console.log(`Processing complete!`);
  console.log(`🎯 Transformation: ${oldSingular}/${oldPlural} → ${newSingular}/${newPlural}`);
}

// Run the script
processDirectory();