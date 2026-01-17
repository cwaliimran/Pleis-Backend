const cron = require("node-cron");
const { reconcilePendingTicketingOrdersPayments } = require("./payments/reconcilePendingTicketingOrdersPayments");
const { reconcilePendingUserReservationPayments } = require("./payments/reconcilePendingUserReservationPayments");

const startCrons = () => {
  // Runs every 2 minutes // */2 * * * *
  //for every 5 seconds use: */5 * * * * *
  cron.schedule("*/5 * * * * *", async () => {
    try {
      // await reconcilePendingTicketingOrdersPayments();
      // await reconcilePendingUserReservationPayments();
    } catch (err) {
      console.error("❌ Reconciliation job failed:", err);
    }
  });
};

module.exports = { startCrons };
