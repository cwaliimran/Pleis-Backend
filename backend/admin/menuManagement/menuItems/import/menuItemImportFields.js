/**
 * Menu item import / export format (Requirement Set #122, #97, #146).
 *
 * This is OUR format. Organizer files come in any shape; the admin maps their columns to
 * these keys (and their names for menus, subcategories, presets… to our records) before
 * the import runs. The CSV template and the export use exactly these keys as headers.
 *
 * kind:
 *   text | number | boolean | enum | list(enum)   plain values
 *   ref / refList                                 resolved against our records by name/code
 */
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const FIELDS = [
  { key: "id", label: "Pleis item ID", kind: "text", help: "Leave empty for new items. Filled in by the export; used to update an existing item.", aliases: ["_id", "item id", "pleis id"] },
  { key: "title", label: "Name", kind: "text", required: true, aliases: ["name", "item", "item name", "naziv", "artikl", "proizvod", "product"] },
  { key: "description", label: "Description", kind: "text", aliases: ["opis", "details"] },
  { key: "menu", label: "Menu", kind: "ref", ref: "menu", required: true, help: "Menu name. Can be set once for the whole file instead of per row.", aliases: ["menu name", "jelovnik", "meni"] },
  { key: "subCategory", label: "Subcategory", kind: "ref", ref: "subCategory", required: true, help: "Subcategory name — map the organizer's categories to ours.", aliases: ["category", "sub category", "kategorija", "potkategorija", "group", "grupa"] },
  { key: "basePrice", label: "Price (EUR)", kind: "number", required: true, min: 0.01, aliases: ["price", "cijena", "cijena (eur)", "amount", "iznos", "mpc"] },
  { key: "taxPercent", label: "Tax class (%)", kind: "enum", options: ["25", "13", "5", "0"], required: true, help: "VAT rate. A row without a tax class is rejected (Billko v2.9 §3.3).", aliases: ["tax", "vat", "pdv", "pdv %", "porez", "tax %", "vat %"] },
  { key: "status", label: "Status", kind: "enum", options: ["active", "inactive"], default: "active", aliases: ["state", "aktivno", "active"] },
  { key: "isAvailableInStock", label: "In stock", kind: "boolean", default: true, aliases: ["available", "in stock", "dostupno", "na stanju"] },
  { key: "ageRestricted", label: "18+ age restricted", kind: "boolean", default: false, aliases: ["age_restricted", "18+", "alcohol", "alkohol", "age restricted"] },
  { key: "isTogo", label: "Available to go", kind: "boolean", default: false, help: "Item attribute only (#146). Never allowed together with 18+.", aliases: ["to go", "togo", "takeaway", "za van"] },
  { key: "isRecommended", label: "Recommended", kind: "boolean", default: false, aliases: ["recommended", "preporuka"] },
  { key: "upSellItem", label: "Upsell item", kind: "boolean", default: false, aliases: ["upsell"] },
  { key: "isRequiresOrderConfirmation", label: "Requires order confirmation", kind: "boolean", default: false, aliases: ["requires confirmation", "confirmation"] },
  { key: "presetType", label: "Preset type", kind: "ref", ref: "presetType", help: "Preset type name or code (e.g. Cocktail / COC0000).", aliases: ["preset", "type", "vrsta"] },
  { key: "brand", label: "Brand", kind: "ref", ref: "brand", aliases: ["brand name", "proizvođač", "marka"] },
  { key: "amountQuantity", label: "Amount", kind: "text", help: "e.g. 250ml, 0.5l, 200g", aliases: ["quantity", "volume", "size", "količina", "zapremina", "amount"] },
  { key: "quantityType", label: "Quantity type", kind: "enum", options: ["single", "combo"], default: "single", aliases: [] },
  { key: "servingSize", label: "Serving", kind: "ref", ref: "serving", help: "Serving code or type (e.g. SERV001 / Bottle(L)).", aliases: ["serving", "posluživanje", "pakiranje", "container"] },
  { key: "availableDays", label: "Available days", kind: "list", options: DAYS, help: "Comma separated, e.g. monday, friday. Empty = every day.", aliases: ["days", "dani"] },
  { key: "daypart", label: "Dayparts", kind: "refList", ref: "daypart", help: "Comma separated daypart names.", aliases: ["daypart", "dayparts", "meal time"] },
  { key: "dietTags", label: "Diet tags", kind: "refList", ref: "dietTag", help: "Comma separated, e.g. Vegan, Gluten free", aliases: ["diet", "diet tags", "prehrana"] },
  { key: "allergens", label: "Allergens", kind: "refList", ref: "allergen", help: "Comma separated allergen names", aliases: ["allergen", "alergeni"] },
  { key: "cuisine", label: "Cuisine", kind: "text", aliases: ["kuhinja"] },
  { key: "startTime", label: "Available from", kind: "time", help: "24h HH:mm in the venue's time zone", aliases: ["from", "od"] },
  { key: "endTime", label: "Available until", kind: "time", help: "24h HH:mm in the venue's time zone", aliases: ["to", "until", "do"] },
];

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

// Template examples: a drink, an 18+ drink and a food item. Names are swapped for the
// company's matching records when the template is downloaded (see buildTemplate).
const SAMPLE_ROWS = [
  {
    id: "", title: "Espresso", description: "Single shot of espresso", menu: "Drinks", subCategory: "Coffee",
    basePrice: "2.00", taxPercent: "13", status: "active", isAvailableInStock: "yes", ageRestricted: "no", isTogo: "yes",
    isRecommended: "no", upSellItem: "yes", isRequiresOrderConfirmation: "no", presetType: "", brand: "", amountQuantity: "30ml",
    quantityType: "single", servingSize: "", availableDays: "", daypart: "Breakfast, Brunch", dietTags: "Vegan", allergens: "", cuisine: "",
    startTime: "07:00", endTime: "12:00",
  },
  {
    id: "", title: "Craft beer 0.5 l", description: "Local IPA on tap", menu: "Drinks", subCategory: "Beer",
    basePrice: "4.50", taxPercent: "25", status: "active", isAvailableInStock: "yes", ageRestricted: "yes", isTogo: "no",
    isRecommended: "yes", upSellItem: "no", isRequiresOrderConfirmation: "no", presetType: "", brand: "", amountQuantity: "500ml",
    quantityType: "single", servingSize: "", availableDays: "friday, saturday", daypart: "Late night", dietTags: "", allergens: "Gluten", cuisine: "",
    startTime: "16:00", endTime: "23:30",
  },
  {
    id: "", title: "Pizza Margherita", description: "Tomato, mozzarella, fresh basil", menu: "Food", subCategory: "Pizza",
    basePrice: "9.90", taxPercent: "13", status: "active", isAvailableInStock: "yes", ageRestricted: "no", isTogo: "yes",
    isRecommended: "yes", upSellItem: "no", isRequiresOrderConfirmation: "no", presetType: "", brand: "", amountQuantity: "350g",
    quantityType: "single", servingSize: "", availableDays: "", daypart: "Lunch, Dinner", dietTags: "Vegetarian", allergens: "Gluten, Milk", cuisine: "Italian",
    startTime: "", endTime: "",
  },
];

module.exports = { FIELDS, FIELD_BY_KEY, SAMPLE_ROWS, DAYS };
