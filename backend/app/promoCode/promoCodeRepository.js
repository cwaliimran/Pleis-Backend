const { PromoCode } = require("@PromoCodeModel");


// ==============================
// APPLY PROMO CODE
// ==============================

const usePromoCode = async (data, session = null) => {
  try {
    const { promoCode, userId, companyOrganizer, amount } = data;

    const normalizedCode = promoCode.trim().toUpperCase();

    const foundPromoCode = await PromoCode.findOne(
      {
        promoCode: normalizedCode,
        companyOrganizer,
      },
      null,
      { session }
    );

    if (!foundPromoCode) {
      return { error: "Promo code not found for the given organizer." };
    }

    // status check
    if (foundPromoCode.status !== "active") {
      return { error: "Promo code is not active." };
    }

    // expiry check
    if (new Date() > foundPromoCode.expiryDate) {
      return { error: "Promo code has expired." };
    }

    // global usage check
    if (foundPromoCode.usedCount >= foundPromoCode.maxUsage) {
      return { error: "Promo code usage limit reached." };
    }

    const userKey = userId.toString();
    const userUsage = foundPromoCode.usersUsed.get(userKey);

    // user usage check
    if (userUsage && userUsage.count >= foundPromoCode.maxCountPerUser) {
      return {
        error: "You have exceeded the maximum usage for this promo code.",
      };
    }

    // -------------------------
    // Calculate Discount
    // -------------------------

    let discount = 0;

    if (foundPromoCode.discountType === "percentage") {
      discount = (foundPromoCode.discountValue / 100) * amount;

      if (
        foundPromoCode.maxDiscountCap > 0 &&
        discount > foundPromoCode.maxDiscountCap
      ) {
        discount = foundPromoCode.maxDiscountCap;
      }
    }

    if (foundPromoCode.discountType === "amount") {
      discount = foundPromoCode.discountValue;

      if (
        foundPromoCode.maxDiscountCap > 0 &&
        discount > foundPromoCode.maxDiscountCap
      ) {
        discount = foundPromoCode.maxDiscountCap;
      }
    }

    //if final amount is negative, return error
    if (amount - discount < 0) {
      return {
        error: "Discount exceeds the total amount. Please adjust your order.",
      };
    }
    const finalAmount = Math.max(amount - discount, 0);
    

    // -------------------------
    // Increment Usage
    // -------------------------

    foundPromoCode.usedCount += 1;

    if (userUsage) {
      foundPromoCode.usersUsed.set(userKey, {
        count: userUsage.count + 1,
      });
    } else {
      foundPromoCode.usersUsed.set(userKey, {
        count: 1,
      });
    }

    await foundPromoCode.save({ session });

    return {
      success: true,
      discount,
      finalAmount,
      maxDiscountCap: foundPromoCode.maxDiscountCap,
      discountType: foundPromoCode.discountType,
    };

  } catch (err) {
    throw err;
  }
};


// ==============================
// VALIDATE PROMO CODE
// ==============================

const validatePromoCode = async (data) => {
  try {
    const { promoCode, userId, companyOrganizer, amount } = data;

    const foundPromoCode = await PromoCode.findOne({
      promoCode,
      companyOrganizer,
    });
    if (!foundPromoCode) {
      return { error: "Promo code not found for the given organizer." };
    }

    if (foundPromoCode.status !== "active") {
      return { error: "Promo code is not active." };
    }

    if (new Date() > foundPromoCode.expiryDate) {
      return { error: "Promo code has expired." };
    }

    if (foundPromoCode.usedCount >= foundPromoCode.maxUsage) {
      return { error: "Promo code usage limit reached." };
    }

    const userKey = userId.toString();
    const userUsage = foundPromoCode.usersUsed.get(userKey);

    if (userUsage && userUsage.count >= foundPromoCode.maxCountPerUser) {
      return {
        error: "You have already used this promo code the maximum number of times.",
      };
    }

    // preview discount only
    let discount = 0;

    if (foundPromoCode.discountType === "percentage") {
      discount = (foundPromoCode.discountValue / 100) * (amount || 0);

      if (
        foundPromoCode.maxDiscountCap > 0 &&
        discount > foundPromoCode.maxDiscountCap
      ) {
        discount = foundPromoCode.maxDiscountCap;
      }
    }

    if (foundPromoCode.discountType === "amount") {
      discount = foundPromoCode.discountValue;

      if (
        foundPromoCode.maxDiscountCap > 0 &&
        discount > foundPromoCode.maxDiscountCap
      ) {
        discount = foundPromoCode.maxDiscountCap;
      }
    }

    const finalAmount = Math.max((amount || 0) - discount, 0);

    return {
      valid: true,
      discount,
      finalAmount,
      maxDiscountCap: foundPromoCode.maxDiscountCap,
      discountType: foundPromoCode.discountType,
    };
  } catch (err) {
    throw err;
  }
};


module.exports = {
  usePromoCode,
  validatePromoCode,
};