const { PromoCode } = require('@PromoCodeModel'); // Adjust path to your PromoCode model

const usePromoCode = async (data) => {
  try {
    const { promoCode, userId, companyOrganizer, amount } = data;


    const foundPromoCode = await PromoCode.findOne({ promoCode, companyOrganizer });

    if (!foundPromoCode) {
      return { error: "Promo code not found for the given organizer." };
    }

    // Check if the promo code is active
    if (foundPromoCode.status !== "active") {
      return { error: "Promo code is not active." };
    }

    // Check if the promo code has expired
    const now = new Date();
    if (now > foundPromoCode.expiryDate) {
      return { error: "Promo code has expired." };
    }

    // Check if the user has exceeded the allowed usage limit for this promo code
    const userUsage = foundPromoCode.usersUsed.get(userId); // Retrieve the user's usage object by userId

    if (userUsage && userUsage.count >= foundPromoCode.maxCountPerUser) {
      return { error: "You have exceeded the maximum usage for this promo code." };
    }

    // Proceed to apply the discount (if valid)
    const discountResponse = foundPromoCode.applyDiscount(amount, userId);

    // If there's an error applying the discount, return it
    if (discountResponse.error) {
      return discountResponse;
    }

    // Increment the usage count for the user and the promo code
    const incremented = await foundPromoCode.incrementUsage(userId);
    console.log("incremented",incremented );

    if (!incremented) {
      return { error: "Unable to increment usage for this promo code." };
    }
console.log("discountResponse",discountResponse );
    // Return the successful response with the discount details
    return { 
      message: "Promo code applied successfully", 
discount: foundPromoCode.discountValue,
maxDiscountCap: foundPromoCode.maxDiscountCap,
discountType: foundPromoCode.discountType,

    };
  } catch (err) {
    console.error("Error in usePromoCode:", err);
    throw err;
  }
};

module.exports = {
  usePromoCode,
};
