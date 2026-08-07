function formatMenuItemsCombo(combo) {
  const obj = typeof combo.toObject === "function" ? combo.toObject() : combo;
  if (!obj) return null;

  const totalBasePrice = (obj.menuItems || []).reduce((sum, item) => {
    const basePrice = item?.menuItem?.basePrice || 0;
    const quantity = item?.quantity || 0;
    return sum + basePrice * quantity;
  }, 0);

  return { ...obj, totalBasePrice };
}

function formatMenuItemsComboList(combos = []) {
  return combos.map((combo) => formatMenuItemsCombo(combo));
}

module.exports = {
  formatMenuItemsCombo,
  formatMenuItemsComboList,
};
