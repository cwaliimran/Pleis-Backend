const {
  calculateDiscountFinalPrice,
} = require("@MenuItemsDiscountsModel");

const calculateItemPrice = (menuItem) => {
  const originalPrice = menuItem.basePrice;

  let saleDiscount = 0;
  let finalPrice = originalPrice;

  // V2 — MenuItemsDiscounts attached on item.discount (already conflict-resolved)
  if (menuItem.discount) {
    finalPrice = calculateDiscountFinalPrice(originalPrice, menuItem.discount);
    saleDiscount = Math.max(originalPrice - finalPrice, 0);

    return {
      originalPrice,
      saleDiscount,
      finalPrice,
    };
  }

  // V1 — legacy menuitemssales lookup fields
  if (menuItem.saleDiscountValue) {
    if (menuItem.saleDiscountType === "percentage") {
      saleDiscount = (originalPrice * menuItem.saleDiscountValue) / 100;
      finalPrice = Math.max(originalPrice - saleDiscount, 0);
    }

    if (menuItem.saleDiscountType === "fixed") {
      saleDiscount = menuItem.saleDiscountValue;
      finalPrice = saleDiscount;
    }
  }

  return {
    originalPrice,
    saleDiscount,
    finalPrice,
  };
};

module.exports = { calculateItemPrice };