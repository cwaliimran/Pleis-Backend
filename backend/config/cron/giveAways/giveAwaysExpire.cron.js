// crons/reservations/reservationReminder.cron.js
const Giveaways = require("@GiveawayModel");

const giveAwaysExpireCron = async () => {
  const now = new Date();

 
  try {
    // check giveaways where end date is in past and update status to inactive
 let giveaways = await Giveaways.updateMany(
      { endDateTime: { $lte: now }, status: "active" },
      { $set: { status: "inactive" } }
    );
    console.log(`giveAwaysExpireCron: Updated ${giveaways.modifiedCount} giveaways to expired status`);
  } catch (err) {
    console.error("Giveaways expiry cron failed:", err);
  }
};

module.exports = { giveAwaysExpireCron };