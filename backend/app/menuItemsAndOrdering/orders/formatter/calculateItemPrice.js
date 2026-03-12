const calculateItemPrice = (menuItem) => {
  const originalPrice = menuItem.basePrice;

  let saleDiscount = 0;

  if (menuItem.saleDiscountValue) {
    if (menuItem.saleDiscountType === "percentage") {
      saleDiscount = (originalPrice * menuItem.saleDiscountValue) / 100;
    }

    if (menuItem.saleDiscountType === "fixed") {
      saleDiscount = menuItem.saleDiscountValue;
    }
  }

  const finalPrice = Math.max(originalPrice - saleDiscount, 0);

  return {
    originalPrice,
    saleDiscount,
    finalPrice
  };
};

module.exports = { calculateItemPrice };