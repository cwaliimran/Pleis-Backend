const cron = require("node-cron");
const { acquireLock, releaseLock } = require("@redisCache");

const {
  reconcilePendingTicketingOrdersPayments,
} = require("./payments/reconcilePendingTicketingOrdersPayments");

const {
  reconcilePendingUserReservationPayments,
} = require("./payments/reconcilePendingUserReservationPayments");

const { runRecurringEventsCron } = require("./events/recurringEvents.core");
const { runEventReminderCron } = require("./events/eventReminder.cron");
const { runRecurringPromotionsCron } = require("../../admin/loyalty/promotions/utils/recurringPromotion.core");
const { runRecurringGlobalPromotionsCron } = require("../../admin/globalLoyalty/promotions/utils/recurringPromotion.core");
const { runLoyaltyChallengeExpiringSoonCron } = require("./loyalty/challenges/challengeExpiringSoonCron");
const { runGlobalChallengeExpiringSoonCron } = require("./globalLoyalty/challenges/globalChallengeExpiringSoonCron");
const { flushEngagementBuffer } = require("./engagement/flushEngagementBuffer");
const { PromoCodeExpireCron } = require("./promoCodeValidity/PromoCodeExpire.cron");
const { runSubscriptionReminderCron } = require("./subScription/subScription.cron");

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



  ///* ======================================================
  //   🕛 CRON 3: Event reminders (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("* * * * *", async () => {
    const lockKey = "cron:event-reminders";
    const lock = await acquireLock(lockKey, 50);

    if (!lock) return;

    try {
      await runEventReminderCron();
    } catch (err) {
      console.error("Reminder cron error:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });


  /* ======================================================
     ⏳ CRON 4: Challenge expiring soon reminders (every hour)
     ====================================================== */
  cron.schedule("0 * * * *", async () => {
    const lockKey = "cron:challenge-expiring-soon";
    const lock = await acquireLock(lockKey, 50);

    if (!lock) return;

    try {
      await runLoyaltyChallengeExpiringSoonCron();
    } catch (err) {
      console.error("Challenge expiring soon cron error:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });


  /* ======================================================
     ⏳ CRON 5: Global Challenge expiring soon reminders (every hour)
     ====================================================== */
  cron.schedule("0 * * * *", async () => {
    const lockKey = "cron:global-challenge-expiring-soon";
    const lock = await acquireLock(lockKey, 50);

    if (!lock) return;

    try {
      await runGlobalChallengeExpiringSoonCron();
    } catch (err) {
      console.error("Global Challenge expiring soon cron error:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });

  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("*/10 * * * *", async () => {
    const lockKey = "cron:engagement-buffer-flush";
    const lock = await acquireLock(lockKey, 120);

    if (!lock) return;

    try {
      await flushEngagementBuffer();
      console.log("📊 Engagement buffer flushed");
    } catch (err) {
      console.error("❌ Engagement flush cron failed:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });



  ///* ======================================================
  //   🕛 CRON 6: Promo code expiry (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 * * * *", async () => { // run every 1 hour for production
    const lockKey = "cron:promo-code-expiry";
    const lock = await acquireLock(lockKey, 50);

    if (!lock) return;

    try {
      await PromoCodeExpireCron();
    } catch (err) {
      console.error("Promo code expiry cron error:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });

  ///* ======================================================
  //   🕛 CRON 6: Promo code expiry (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 * * * *", async () => { // run every 1 hour for production
    const lockKey = "cron:subscription-reminder";
    const lock = await acquireLock(lockKey, 50);

    if (!lock) return;

    try {
      await runSubscriptionReminderCron();
    } catch (err) {
      console.error("Subscription reminder cron error:", err);
    } finally {
      await releaseLock(lockKey, lock);
    }
  });


  
};

module.exports = { startCrons };
