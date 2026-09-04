const { User } = require("../models/UserModel");
const { Devices } = require("../models/Devices");
const { userCache } = require("../config/nodeCache");
const {
  invalidateOrganizerBillkoReadyCache,
} = require("../commonModules/paymentsIntegrations/billko/billkoAuth");

const HARD_DELETE_SELECT =
  "+deletionMeta email username phoneNumber provider firstName lastName accountState googleId facebookId appleId";

const hardDeleteUserById = async (userId) => {
  const user = await User.findById(userId).select(HARD_DELETE_SELECT);

  if (!user) return null;

  if (user.accountState.status === "deleted") {
    userCache.del(userId.toString());
    invalidateOrganizerBillkoReadyCache(userId);
    return { alreadyDeleted: true };
  }

  const randomEmail = `deleted_user_${userId}_${Date.now()}@example.com`;

  await User.findByIdAndUpdate(userId, {
    $set: {
      email: randomEmail,
      username: `deleted_${userId}`,
      password: "",
      phoneNumber: { code: "", number: "" },
      profileIcon: "noimage.png",
      provider: "email",
      googleId: null,
      facebookId: null,
      appleId: null,
      resetToken: "",
      "twoFA.secret": null,
      "twoFA.isEnabled": false,
      "accountState.status": "deleted",
      deletionMeta: {
        deletedAt: new Date(),
        previousEmail: user.email,
        previousUsername: user.username || "",
        previousPhoneNumber: {
          code: user.phoneNumber?.code || "",
          number: user.phoneNumber?.number || "",
        },
        previousProvider: user.provider || "email",
        previousFirstName: user.firstName || "",
        previousLastName: user.lastName || "",
      },
    },
  });

  await Devices.updateOne({ userId }, { $set: { devices: [] } });
  userCache.del(userId.toString());
  invalidateOrganizerBillkoReadyCache(userId);

  return { alreadyDeleted: false };
};

module.exports = { hardDeleteUserById };
