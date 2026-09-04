const { Worker } = require("bullmq");
const connection = require("../connection");
const { QUEUE_NAMES } = require("../queues");
const mongoose = require("mongoose");
const Menus = require("@MenusModel");

// TODO: replace with your real DB queries (Sequelize/Prisma/Mongoose/raw SQL)
async function activateMenuForOrganization(organizationId, menuId) {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Deactivate every OTHER menu currently active for this organization
    await Menus.updateMany(
      { organization: organizationId, status: "active", _id: { $ne: menuId } },
      { $set: { status: "inactive" } },
      { session },
    );

    // 2. Activate the target menu
    const menu = await Menus.findByIdAndUpdate(
      menuId,
      { $set: { status: "active" } },
      { session, new: true },
    );

    if (!menu) {
      throw new Error(`Menu not found: ${menuId}`);
    }

    await session.commitTransaction();
    session.endSession();


    return {
      organizationId,
      menuId,
      activatedAt: new Date().toISOString(),
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err; // let it bubble up so BullMQ's retry logic kicks in
  }
}

function validatePayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Job data is missing or invalid");
  }
  if (!data.organizationId) {
    throw new Error("organizationId is required");
  }
  if (!data.menuId) {
    throw new Error("menuId is required");
  }
}

const activeMenuWorker = new Worker(
  QUEUE_NAMES.ACTIVE_MENU,
  async (job) => {
    validatePayload(job.data);
    const { organizationId, menuId } = job.data;
    return activateMenuForOrganization(organizationId, menuId);
  },
  {
    connection,
    skipVersionCheck: true,
    concurrency: 5,
  },
);

activeMenuWorker.on("completed", (job) => {
  logger.info("active-menu job completed", {
    jobId: job?.id,
    organizationId: job?.data?.organizationId,
    menuId: job?.data?.menuId,
  });
});

activeMenuWorker.on("failed", (job, err) => {
  logger.error("active-menu job failed", {
    jobId: job?.id,
    organizationId: job?.data?.organizationId,
    menuId: job?.data?.menuId,
    error: err?.message,
    stack: err?.stack,
  });
});

activeMenuWorker.on("error", (err) => {
  logger.error("active-menu worker error", {
    error: err?.message,
    stack: err?.stack,
  });
});

module.exports = activeMenuWorker;
