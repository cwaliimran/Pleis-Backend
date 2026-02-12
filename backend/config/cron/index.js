const cron = require("node-cron");
const { acquireLock, releaseLock } = require("../redis/redisCache");

const {
  reconcilePendingTicketingOrdersPayments,
} = require("./payments/reconcilePendingTicketingOrdersPayments");

const {
  reconcilePendingUserReservationPayments,
} = require("./payments/reconcilePendingUserReservationPayments");

const { runRecurringEventsCron } = require("./events/recurringEvents.core");
const { runRecurringPromotionsCron } = require("../../admin/loyalty/promotions/utils/recurringPromotion.core");
const { runRecurringGlobalPromotionsCron } = require("../../admin/globalLoyalty/promotions/utils/recurringPromotion.core");

const startCrons = () => {
  /* ======================================================
     🔁 CRON 1: Reconcile pending payments (every 5 seconds)
     ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => {
  //   const lockKey = "cron:reconcile-payments";
  //   const lock = await acquireLock(lockKey, 10); // 10s TTL

  //   if (!lock) return;

  //   try {
  //     // await reconcilePendingTicketingOrdersPayments();
  //     // await reconcilePendingUserReservationPayments();
  //     // console.log("✅ Payment reconciliation completed");
  //   } catch (err) {
  //     console.error("❌ Reconciliation job failed:", err);
  //   } finally {
  //     await releaseLock(lockKey, lock);
  //   }
  // });

  /* ======================================================
     🕛 CRON 2: Recurring events (every day at midnight)
     ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 0 0 * * *", async () => {
    const lockKey = "cron:recurring-events-midnight";
    const lock = await acquireLock(lockKey, 60); // 1 min TTL

    if (!lock) return;

    try {
      await runRecurringEventsCron();
      await runRecurringPromotionsCron();
      await runRecurringGlobalPromotionsCron();
      console.log("✅ Midnight recurring cron completed");
    } catch (err) {
      console.error("❌ Midnight recurring cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });
};

module.exports = { startCrons };
