const { popBufferBatch } = require("@redisCache");
const EngagementEvents = require("@EngagementEventsModel");

const BATCH_SIZE = 2000;

const flushEngagementBuffer = async () => {
  let totalInserted = 0;

  while (true) {
    const batch = await popBufferBatch("engagement", BATCH_SIZE);

    if (!batch.length) break;

    await EngagementEvents.insertMany(batch, {
      ordered: false
    });

    totalInserted += batch.length;

    // Safety stop to prevent runaway jobs
    if (totalInserted > 50000) break;
  }

  if (totalInserted > 0) {
    console.log(`📊 Flushed ${totalInserted} engagement events`);
  }
};

module.exports = { flushEngagementBuffer };