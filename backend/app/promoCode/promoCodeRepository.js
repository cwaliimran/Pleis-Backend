const { NotificationTypes } = require('@NotificationsModel');
const { PromoCode } = require('@PromoCodeModel'); // Adjust path to your PromoCode model
const { sendUserNotifications } = require('../../controllers/communicationController');
const { getFullImageUrl } = require('@utils/imageHelper');

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
      await sendUserNotifications({
        recipientIds: [userId.toString()],
        title: "Promo Code Expired",
        body: `The promo code: ${promoCode} has expired.`,
        data: {
          type: NotificationTypes.PROMO_UPDATE,
          objectType: "PromoCode",
        },
        image: (foundPromoCode.image) || "noimage",
        sender: userId,
        objectId: foundPromoCode._id,
      });
      return { error: "Promo code has expired." };
    }

    // Check if the user has exceeded the allowed usage limit for this promo code
    const userUsage = foundPromoCode.usersUsed.get(userId); // Retrieve the user's usage object by userId

    if (userUsage && userUsage.count >= foundPromoCode.maxCountPerUser) {
      await sendUserNotifications({
        recipientIds: [userId.toString()],
        title: "Promo Code Usage Exceeded",
        body: `You have exceeded the maximum usage for the promo code: ${promoCode}.`,
        data: {
          type: NotificationTypes.PROMO_UPDATE,
          objectType: "PromoCode",
        },
        image: (foundPromoCode.image) || "noimage",
        sender: userId,
        objectId: foundPromoCode._id,
      });
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


    if (!incremented) {
      return { error: "Unable to increment usage for this promo code." };
    }

    // Return the successful response with the discount details
    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title: "Promo Code Applied Successfully",
      body: `You have successfully applied the promo code: ${promoCode}.`,
      data: {
        type: NotificationTypes.PROMO_UPDATE,
        objectType: "PromoCode",
      },
      image: (foundPromoCode.image) || "noimage",
      sender: userId,
      objectId: foundPromoCode._id,
    });
    return {
      message: "Promo code applied successfully",
      discount: foundPromoCode.discountValue,
      maxDiscountCap: foundPromoCode.maxDiscountCap,
      discountType: foundPromoCode.discountType,


    };
  } catch (err) {
   
    throw err;
  }
};
const validatePromoCode = async (data) => {
  try {
    const { promoCode, userId, companyOrganizer } = data;


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
      await sendUserNotifications({
        recipientIds: [userId.toString()],
        title: "Promo Code Expired",
        body: `The promo code: ${promoCode} has expired.`,
        data: {
          type: NotificationTypes.PROMO_UPDATE,
          objectType: "PromoCode",
        },
        image: (foundPromoCode.image) || "noimage",
        sender: userId,
        objectId: foundPromoCode._id,
      });
      return { error: "Promo code has expired." };
    }

    // Check if the user has exceeded the allowed usage limit for this promo code
    const userUsage = foundPromoCode.usersUsed.get(userId); // Retrieve the user's usage object by userId

    if (userUsage && userUsage.count >= foundPromoCode.maxCountPerUser) {
      await sendUserNotifications({
        recipientIds: [userId.toString()],
        title: "Promo Code Usage Exceeded",
        body: `You have exceeded the maximum usage for the promo code: ${promoCode}.`,
        data: {
          type: NotificationTypes.PROMO_UPDATE,
          objectType: "PromoCode",
        },
        image: (foundPromoCode.image) || "noimage",
        sender: userId,
        objectId: foundPromoCode._id,
      });
      return { error: "You have exceeded the maximum usage for this promo code." };
    }

    return {
      discount: foundPromoCode.discountValue,
      maxDiscountCap: foundPromoCode.maxDiscountCap,
      discountType: foundPromoCode.discountType,
    };
  } catch (err) {

    throw err;
  }
};

module.exports = {
  usePromoCode,
  validatePromoCode
};
