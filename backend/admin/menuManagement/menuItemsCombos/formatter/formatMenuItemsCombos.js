function formatMenuItemsCombo(combo) {
  const obj = typeof combo.toObject === "function" ? combo.toObject() : combo;
  if (!obj) return null;
  return obj;
}

function formatMenuItemsComboList(combos = []) {
  return combos.map((combo) => formatMenuItemsCombo(combo));
}

module.exports = {
  formatMenuItemsCombo,
  formatMenuItemsComboList,
};
