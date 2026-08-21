const { PriceMode } = require("@MenuItemsCombosModel");
const { formatMenuItem } = require("./formatMenuItems");

const resolveComponentQuantity = (quantity) => {
  const qty = Number(quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
};

const calculateComboPrice = (priceMode, price, formattedItems = []) => {
  const originalPrice = formattedItems.reduce((sum, item) => {
    const unitPrice = item.salePrice ?? item.basePrice ?? 0;
    return sum + unitPrice * resolveComponentQuantity(item.quantity);
  }, 0);

  let salePrice = originalPrice;

  switch (priceMode) {
    case PriceMode.FIXED_COMBO_PRICE:
      salePrice = Number(price);
      break;
    case PriceMode.PERCENTAGE_OFF_SUM:
      salePrice = originalPrice * (1 - Number(price) / 100);
      break;
    case PriceMode.FIXED_AMOUNT_OFF_SUM:
      salePrice = Math.max(originalPrice - Number(price), 0);
      break;
    default:
      break;
  }

  return {
    originalPrice,
    salePrice: Math.max(salePrice, 0),
    hasDiscount: salePrice < originalPrice,
  };
};

const formatComboMenuItem = (comboItem, { timezone, menuItemById, applyDiscount }) => {
  const fromMenu = menuItemById?.get(comboItem._id.toString());
  const source = fromMenu ? { ...comboItem, ...fromMenu } : comboItem;
  const formatted = formatMenuItem(source, timezone);
  return applyDiscount ? applyDiscount(formatted) : formatted;
};

const normalizeComboMenuItemEntry = (entry) => {
  if (!entry) return null;

  // Nested schema: { menuItem: doc|ObjectId, quantity }
  if (
    entry.menuItem != null &&
    typeof entry.menuItem === "object" &&
    entry.menuItem._id
  ) {
    return {
      item: entry.menuItem,
      quantity: resolveComponentQuantity(entry.quantity),
    };
  }

  // Flat menu item (app remapped combos) or legacy ObjectId entry
  return {
    item: entry,
    quantity: resolveComponentQuantity(entry.quantity),
  };
};

const formatMenuItemsCombo = (
  combo,
  { timezone = null, menuItemById = new Map(), applyDiscount } = {},
) => {
  const obj = typeof combo.toObject === "function" ? combo.toObject() : combo;
  if (!obj) return null;

  const formattedItems = (obj.menuItems || [])
    .map((entry) => normalizeComboMenuItemEntry(entry))
    .filter(Boolean)
    .map(({ item, quantity }) => ({
      ...formatComboMenuItem(item, { timezone, menuItemById, applyDiscount }),
      quantity,
    }));

  const priceInfo = calculateComboPrice(obj.priceMode, obj.price, formattedItems);

  return {
    _id: obj._id,
    name: obj.name,
    description: obj.description || "",
    subCategory: obj.subCategory
      ? {
          _id: obj.subCategory._id,
          title: obj.subCategory.title || obj.subCategory.name || null,
          status: obj.subCategory.status,
        }
      : null,
    priceMode: obj.priceMode,
    price: obj.price,
    status: obj.status,
    menuItems: formattedItems,
    originalPrice: priceInfo.originalPrice,
    salePrice: priceInfo.salePrice,
    hasDiscount: priceInfo.hasDiscount,
  };
};

const formatMenuItemsComboList = (combos = [], options = {}) =>
  combos
    .map((combo) => formatMenuItemsCombo(combo, options))
    .filter(Boolean);

module.exports = {
  formatMenuItemsCombo,
  formatMenuItemsComboList,
  calculateComboPrice,
};
