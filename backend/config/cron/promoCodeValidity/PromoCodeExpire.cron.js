// crons/reservations/reservationReminder.cron.js
const { PromoCode } = require("@PromoCodeModel");


const PromoCodeExpireCron = async () => {
  const now = new Date();

 
  try {
    // check promotions where expiry date is in past and update status to expired
 let promoCodes = await PromoCode.updateMany(
      { expiryDate: { $lte: now }, status: "active" },
      { $set: { status: "inactive" } }
    );

    // 
  } catch (err) {
    console.error("Promo code expiry cron failed:", err);
  }
};

module.exports = { PromoCodeExpireCron };