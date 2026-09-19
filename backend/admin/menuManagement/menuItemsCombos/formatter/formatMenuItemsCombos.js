const { getFullImageUrl } = require("@utils/imageHelper");

function formatMenuItemsCombo(combo) {
  const obj = typeof combo.toObject === "function" ? combo.toObject() : combo;
  if (!obj) return null;

  const totalBasePrice = (obj.menuItems || []).reduce((sum, item) => {
    const basePrice = item?.menuItem?.basePrice || 0;
    const quantity = item?.quantity || 0;
    return sum + basePrice * quantity;
  }, 0);

  if (Array.isArray(obj.menuItems)) {
    obj.menuItems = obj.menuItems.map((item) => {
      if (item?.menuItem?.image !== undefined) {
        item.menuItem.image = getFullImageUrl(
          item.menuItem.image || "noimage.png",
        );
      }
      return item;
    });
  }

  return {
    ...obj,
    image: getFullImageUrl(obj.image || "noimage.png"),
    totalBasePrice,
  };
}

function formatMenuItemsComboList(combos = []) {
  return combos.map((combo) => formatMenuItemsCombo(combo));
}

module.exports = {
  formatMenuItemsCombo,
  formatMenuItemsComboList,
};
