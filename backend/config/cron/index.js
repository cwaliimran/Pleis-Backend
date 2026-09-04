const os = require("os");
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
const {
  runRecurringPromotionsCron,
} = require("../../admin/loyalty/promotions/utils/recurringPromotion.core");
const {
  runRecurringGlobalPromotionsCron,
} = require("../../admin/globalLoyalty/promotions/utils/recurringPromotion.core");
const {
  runLoyaltyChallengeExpiringSoonCron,
} = require("./loyalty/challenges/challengeExpiringSoonCron");
const {
  runGlobalChallengeExpiringSoonCron,
} = require("./globalLoyalty/challenges/globalChallengeExpiringSoonCron");
const { flushEngagementBuffer } = require("./engagement/flushEngagementBuffer");
const {
  PromoCodeExpireCron,
} = require("./promoCodeValidity/PromoCodeExpire.cron");
const {
  runSubscriptionReminderCron,
} = require("./subScription/subScription.cron");
const {
  giveAwaysExpireCron,
  giveAwaysExpireAndWinnerCron,
} = require("./giveAways/giveAwaysExpireAndWinnerCron.cron");
const { runLoyaltyChallengeUpdateCron } = require("./loyalty/challenges/challengeUpdate");

const HOSTNAME = os.hostname();

const cronContext = (extra = {}) => ({
  role: process.env.PROCESS_ROLE || "unknown",
  hostname: HOSTNAME,
  pid: process.pid,
  ...extra,
});

async function runLockedCron(lockKey, ttlSeconds, job) {
  const lock = await acquireLock(lockKey, ttlSeconds);

  if (!lock) {
    logger.info("Cron skipped (lock held)", cronContext({ lockKey }));
    return;
  }

  try {
    logger.info("Cron run started", cronContext({ lockKey }));
    await job();
    logger.info("Cron run completed", cronContext({ lockKey }));
  } catch (err) {
    logger.error("Cron run failed", cronContext({
      lockKey,
      error: err.message,
      stack: err.stack,
    }));
  } finally {
    await releaseLock(lockKey, lock);
  }
}

const startCrons = () => {
  if (process.env.PROCESS_ROLE === "web") {
    logger.error(
      "startCrons refused: cron must run on the worker process only",
      cronContext(),
    );
    return;
  }

  logger.info("Cron scheduler starting", cronContext());

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
    await runLockedCron("cron:recurring-events-midnight", 60, async () => {
      await runRecurringEventsCron();
      await runRecurringPromotionsCron();
      await runRecurringGlobalPromotionsCron();
    });
  });

  ///* ======================================================
  //   🕛 CRON 3: Event reminders (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("* * * * *", async () => {
    await runLockedCron("cron:event-reminders", 50, () => runEventReminderCron());
  });

  /* ======================================================
     ⏳ CRON 4: Challenge expiring soon reminders (every hour)
     ====================================================== */
  cron.schedule("0 * * * *", async () => {
    await runLockedCron("cron:challenge-expiring-soon", 50, () =>
      runLoyaltyChallengeExpiringSoonCron(),
    );
  });
  /* ======================================================
     ⏳ CRON 4: Challenge update 
     ====================================================== */
  cron.schedule("5 0 * * *", async () => {
    await runLockedCron("cron:challenge-update", 50, () =>
      runLoyaltyChallengeUpdateCron(),
    );
  });

  /* ======================================================
     ⏳ CRON 5: Global Challenge expiring soon reminders (every hour)
     ====================================================== */
  cron.schedule("0 * * * *", async () => {
    await runLockedCron("cron:global-challenge-expiring-soon", 50, () =>
      runGlobalChallengeExpiringSoonCron(),
    );
  });

  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("*/10 * * * *", async () => {
    await runLockedCron("cron:engagement-buffer-flush", 120, () =>
      flushEngagementBuffer(),
    );
  });

  ///* ======================================================
  //   🕛 CRON 6: Promo code expiry (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 * * * *", async () => {
    // run every 1 hour for production
    await runLockedCron("cron:promo-code-expiry", 50, () => PromoCodeExpireCron());
  });

  ///* ======================================================
  //   🕛 CRON 7: Subscription reminder (every 6 hours)
  //   ====================================================== */
  cron.schedule("0 */6 * * *", async () => {
    // run every 6 hours for production
    await runLockedCron("cron:subscription-reminder", 50, () =>
      runSubscriptionReminderCron(),
    );
  });

  ///* ======================================================
  //   🕛 CRON 8: Giveaways expiry (every minute)
  //   ====================================================== */
  // cron.schedule("*/5 * * * * *", async () => { //5 seconds for testing
  cron.schedule("0 * * * *", async () => {
    // run every 1 hour for production
    await runLockedCron("cron:giveaways-expiry", 50, () =>
      giveAwaysExpireAndWinnerCron(),
    );
  });
};

module.exports = { startCrons };
