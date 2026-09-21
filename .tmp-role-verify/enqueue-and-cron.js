/**
 * One-shot APP_ROLE split verification (safe):
 * 1) Enqueue an active-menu job with fake ObjectIds (fails cleanly: Menu not found)
 * 2) Wait for BullMQ failure via QueueEvents (proves worker consumer is alive)
 * 3) Run PromoCodeExpireCron + flushEngagementBuffer once
 */
require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "prodtest"}` });
const path = require("path");
const moduleAlias = require("module-alias");
const aliases = require("../aliasConfig/pathAliases.config");
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(__dirname, "..", target));
}
require("module-alias/register");

const { QueueEvents } = require("bullmq");
const mongoose = require("mongoose");
const connectToDB = require("../backend/helperUtils/server-setup");
const {
  activeMenuQueue,
  QUEUE_NAMES,
} = require("../backend/bullmq/queues");
const connection = require("../backend/bullmq/connection");
const {
  PromoCodeExpireCron,
} = require("../backend/config/cron/promoCodeValidity/PromoCodeExpire.cron");
const {
  flushEngagementBuffer,
} = require("../backend/config/cron/engagement/flushEngagementBuffer");

const FAKE_ORG = "000000000000000000000001";
const FAKE_MENU = "000000000000000000000002";
const JOB_ID = `role-verify-activate-menu-${Date.now()}`;

async function main() {
  global.logger = global.logger || {
    info: (...a) => console.log("[info]", ...a),
    error: (...a) => console.error("[error]", ...a),
    warn: (...a) => console.warn("[warn]", ...a),
  };

  await connectToDB();

  console.log("[verify] enqueue active-menu job", JOB_ID);
  const job = await activeMenuQueue.add(
    "activate-menu",
    { organizationId: FAKE_ORG, menuId: FAKE_MENU },
    {
      jobId: JOB_ID,
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );
  console.log("[verify] enqueued", { id: job.id, name: job.name, queue: QUEUE_NAMES.ACTIVE_MENU });

  const events = new QueueEvents(QUEUE_NAMES.ACTIVE_MENU, {
    connection,
    skipVersionCheck: true,
  });
  await events.waitUntilReady();

  const outcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for job")), 25000);
    const onFailed = ({ jobId, failedReason }) => {
      if (String(jobId) !== String(job.id)) return;
      clearTimeout(timer);
      events.off("completed", onCompleted);
      events.off("failed", onFailed);
      resolve({ status: "failed", jobId, failedReason });
    };
    const onCompleted = ({ jobId, returnvalue }) => {
      if (String(jobId) !== String(job.id)) return;
      clearTimeout(timer);
      events.off("completed", onCompleted);
      events.off("failed", onFailed);
      resolve({ status: "completed", jobId, returnvalue });
    };
    events.on("failed", onFailed);
    events.on("completed", onCompleted);
  });

  console.log("[verify] job outcome", JSON.stringify(outcome));

  console.log("[verify] running PromoCodeExpireCron once...");
  await PromoCodeExpireCron();
  console.log("[verify] PromoCodeExpireCron done");

  console.log("[verify] running flushEngagementBuffer once...");
  await flushEngagementBuffer();
  console.log("[verify] flushEngagementBuffer done");

  await events.close();
  await activeMenuQueue.close();
  await mongoose.connection.close();
  console.log("[verify] OK");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[verify] FAIL", err.message);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
