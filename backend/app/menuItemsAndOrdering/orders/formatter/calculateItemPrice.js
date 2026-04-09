const calculateItemPrice = (menuItem) => {
  const originalPrice = menuItem.basePrice;

  let saleDiscount = 0;
  let finalPrice = originalPrice;
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
    finalPrice
  };
};

module.exports = { calculateItemPrice };