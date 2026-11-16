/**
 * Menu item import / export format (Requirement Set #122, #97, #146) — template v2.
 *
 * Items sheet layout:
 *   row 1  "menus" in A1, then one menu name per cell from B1 to the right — every item in the
 *          file is placed in all of these menus
 *   row 2  column headers (the keys below, in this order — the order of the Menu Item form)
 *   row 3+ one item per row
 *
 * Organizer files in any other shape still work: the admin maps their columns to these keys
 * (and their names for menus, subcategories, presets… to our records) before the import runs.
 *
 * kind:
 *   text | number | boolean | enum | list(enum) | time: plain values
 *   ref / refList: resolved against our records
 */
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** A1 of the Items sheet; the cells to its right are the menus. */
const MENUS_ROW_LABELS = ["menus", "menu", "menu(s)", "jelovnici", "jelovnik"];

const YES_NO = "yes / no — required; an empty cell rejects the row";

const FIELDS = [
  // Basic information
  { key: "id", label: "Pleis item ID", kind: "text", help: "Leave empty for new items. Filled in by the export; the row then updates exactly that item (in its own menu).", aliases: ["_id", "item id", "pleis id"] },
  { key: "presetType", label: "Preset type", kind: "ref", ref: "presetType", required: true, help: "Pick from the Valid values sheet: “CODE · Type › Item”, e.g. COF0429 · Coffee, espresso › Espresso. Matched on the code; without our code on “Type › Item”.", aliases: ["preset", "type", "vrsta"] },
  { key: "brand", label: "Brand", kind: "ref", ref: "brand", help: "Brand name from the Valid values sheet. A new name is created on import (listed under “Will be created”).", aliases: ["brand name", "proizvođač", "marka"] },
  { key: "title", label: "Name", kind: "text", required: true, aliases: ["name", "item", "item name", "naziv", "artikl", "proizvod", "product"] },
  { key: "amountQuantity", label: "Amount", kind: "text", help: "e.g. 250ml, 0.5l, 200g", aliases: ["quantity", "volume", "size", "količina", "zapremina", "amount"] },
  // Classification
  { key: "subCategory", label: "Subcategory", kind: "ref", ref: "subCategory", required: true, help: "The company's own menu section shown to guests (e.g. Coffee, Pizza) — not the Pleis catalogue. A new name is created on import.", aliases: ["category", "sub category", "kategorija", "potkategorija", "group", "grupa"] },
  { key: "description", label: "Description", kind: "text", aliases: ["opis", "details"] },
  { key: "servingSize", label: "Serving", kind: "ref", ref: "serving", help: "Serving label from the Valid values sheet, e.g. Bottle (pcs), or its code (SERV006).", aliases: ["serving", "posluživanje", "pakiranje", "container"] },
  { key: "quantityType", label: "Quantity type", kind: "enum", options: ["single", "combo"], default: "single", help: "single (default) or combo. Empty = single.", aliases: [] },
  // Pricing
  { key: "basePrice", label: "Price (EUR)", kind: "number", required: true, min: 0.01, help: "Number, e.g. 2.50 (2,50 also accepted).", aliases: ["price", "cijena", "cijena (eur)", "amount", "iznos", "mpc"] },
  { key: "taxPercent", label: "Tax class (%)", kind: "enum", options: ["25", "13", "5", "0"], required: true, help: "VAT rate. A row without a tax class is rejected (Billko v2.9 §3.3).", aliases: ["tax", "vat", "pdv", "pdv %", "porez", "tax %", "vat %"] },
  // Availability
  { key: "availableDays", label: "Available days", kind: "list", options: DAYS, help: "Comma separated, e.g. monday, friday. Empty = every day.", aliases: ["days", "dani"] },
  { key: "startTime", label: "Available from", kind: "time", help: "Time (HH:mm, 24h) in the venue's time zone. An end time earlier than the start runs past midnight (22:00–04:00).", aliases: ["from", "od", "start time"] },
  { key: "endTime", label: "Available until", kind: "time", help: "Time (HH:mm, 24h) in the venue's time zone.", aliases: ["to", "until", "do", "end time"] },
  // Daypart
  { key: "daypart", label: "Dayparts", kind: "refList", ref: "daypart", help: "Comma separated daypart names, e.g. breakfast, brunch.", aliases: ["daypart", "dayparts", "meal time"] },
  // Dietary & allergens
  { key: "dietTags", label: "Diet tags", kind: "refList", ref: "dietTag", help: "Comma separated, e.g. vegan, gluten_free", aliases: ["diet", "diet tags", "prehrana"] },
  { key: "allergens", label: "Allergens", kind: "refList", ref: "allergen", help: "Comma separated. Full label, English or Croatian part all match: “milk (mlijeko)”, “milk”, “mlijeko”.", aliases: ["allergen", "alergeni"] },
  { key: "cuisine", label: "Cuisine", kind: "text", aliases: ["kuhinja"] },
  // Visibility & behaviour
  { key: "status", label: "Status", kind: "enum", options: ["active", "inactive"], default: "active", help: "active / inactive. Empty = active.", aliases: ["state", "aktivno", "active"] },
  { key: "isRecommended", label: "Recommended", kind: "boolean", default: false, help: YES_NO, aliases: ["recommended", "preporuka"] },
  { key: "upSellItem", label: "Upsell item", kind: "boolean", default: false, help: YES_NO, aliases: ["upsell"] },
  { key: "isTogo", label: "Available to go", kind: "boolean", default: false, help: `${YES_NO}. Never yes together with 18+ (#146).`, aliases: ["to go", "togo", "takeaway", "za van"] },
  { key: "isRequiresOrderConfirmation", label: "Requires order confirmation", kind: "boolean", default: false, help: YES_NO, aliases: ["requires confirmation", "confirmation"] },
  { key: "isAvailableInStock", label: "In stock", kind: "boolean", default: true, help: YES_NO, aliases: ["available", "in stock", "dostupno", "na stanju"] },
  { key: "ageRestricted", label: "18+ age restricted", kind: "boolean", default: false, help: `${YES_NO}. A row with 18+ and to go both yes is rejected.`, aliases: ["age_restricted", "18+", "alcohol", "alkohol", "age restricted"] },
  // Not a template column: the menus are in row 1. Kept for organizer files that have a menu column.
  { key: "menu", label: "Menu", kind: "ref", ref: "menu", required: true, inTemplate: false, help: "Menus are entered in row 1 (B1 →). A menu column is still read for other file layouts.", aliases: ["menu name", "jelovnik", "meni"] },
];

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const TEMPLATE_FIELDS = FIELDS.filter((f) => f.inTemplate !== false);

// Template examples: a drink, an 18+ drink and a food item. Names are swapped for the
// company's matching records when the template is downloaded (see buildTemplate).
const SAMPLE_ROWS = [
  {
    id: "", presetType: "Coffee, espresso › Espresso", brand: "", title: "Espresso", amountQuantity: "30ml", subCategory: "Coffee",
    description: "Single shot of espresso", servingSize: "", quantityType: "single", basePrice: 2, taxPercent: 13, availableDays: "",
    startTime: "07:00", endTime: "12:00", daypart: "Breakfast, Brunch", dietTags: "Vegan", allergens: "", cuisine: "",
    status: "active", isRecommended: "no", upSellItem: "yes", isTogo: "yes", isRequiresOrderConfirmation: "no", isAvailableInStock: "yes", ageRestricted: "no",
  },
  {
    id: "", presetType: "Beer, ale › IPA", brand: "", title: "Craft beer 0.5 l", amountQuantity: "500ml", subCategory: "Beer",
    description: "Local IPA on tap", servingSize: "", quantityType: "single", basePrice: 4.5, taxPercent: 25, availableDays: "friday, saturday",
    startTime: "16:00", endTime: "23:30", daypart: "Late night", dietTags: "", allergens: "Gluten", cuisine: "",
    status: "active", isRecommended: "yes", upSellItem: "no", isTogo: "no", isRequiresOrderConfirmation: "no", isAvailableInStock: "yes", ageRestricted: "yes",
  },
  {
    id: "", presetType: "Pizza, classic › Margherita", brand: "", title: "Pizza Margherita", amountQuantity: "350g", subCategory: "Pizza",
    description: "Tomato, mozzarella, fresh basil", servingSize: "", quantityType: "single", basePrice: 9.9, taxPercent: 13, availableDays: "",
    startTime: "", endTime: "", daypart: "Lunch, Dinner", dietTags: "Vegetarian", allergens: "Gluten, Milk", cuisine: "Italian",
    status: "active", isRecommended: "yes", upSellItem: "no", isTogo: "yes", isRequiresOrderConfirmation: "no", isAvailableInStock: "yes", ageRestricted: "no",
  },
];

module.exports = { FIELDS, FIELD_BY_KEY, TEMPLATE_FIELDS, SAMPLE_ROWS, DAYS, MENUS_ROW_LABELS };
