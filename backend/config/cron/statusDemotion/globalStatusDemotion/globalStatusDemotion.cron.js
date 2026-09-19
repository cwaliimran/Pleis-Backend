const { User } = require("@UsersModel");
const { checkDemotionGlobal } = require("../../../../app/userWalletService/global/walletManagement/userWalletRepository");


const globalStatusDemotionCron = async () => {
    const users =await User.find({}).select("_id").lean();
  try {
    await processDemotion(users);
  } catch (err) {
    console.error("Global status demotion cron failed:", err);
  }
};
const DEMOTION_CONCURRENCY = 10;
const processDemotion = async (users) => {
  if (!users?.length) return;

  let cursor = 0;
  let demoted = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < users.length) {
      const user = users[cursor++];
      try {
        const result = await checkDemotionGlobal(user._id);

        if (result?.demoted) demoted++;
      } catch (err) {
        failed++;
        console.error("Demotion failed for user:", user._id, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DEMOTION_CONCURRENCY, users.length) }, worker)
  );

};

module.exports = globalStatusDemotionCron;