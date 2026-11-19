const mongoose = require("mongoose");

const DeviceSchema = mongoose.Schema({
  deviceId: {
    type: String,
    default: "",
    required: [true, "device_id_required"],
  },
  deviceType: {
    type: String,
    enum: ["android", "ios", "web"],
    default: "android",
    required: [true, "device_type_required"],
  },
  // Which app registered the token: the guest app or the staff (business) app.
  // Pushes meant for one app skip the other's tokens. Older entries have none.
  app: {
    type: String,
    enum: ["guest", "staff"],
  },
});

const DevicesSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    devices: [DeviceSchema], // Array of device objects
  },
  {
    timestamps: true,
  },
);

const Devices = mongoose.model("device", DevicesSchema);

// Real FCM registration tokens are ~140+ characters. Anything shorter is a
// placeholder the apps send when no token is ready ("123", "abc123",
// "no-fcm-token", "test", ...) and can never receive a push.
const MIN_FCM_TOKEN_LENGTH = 32;
const PLACEHOLDER_DEVICE_ID = new RegExp(`^.{0,${MIN_FCM_TOKEN_LENGTH - 1}}$`, "s");

const isPushToken = (deviceId) =>
  typeof deviceId === "string" && deviceId.trim().length >= MIN_FCM_TOKEN_LENGTH;

const DEVICE_APPS = ["guest", "staff"];

/**
 * App a login comes from, by the userType the app sends: the guest app sends
 * "user", the staff app "staff" (whatever the account's own type is).
 */
const appFromLoginUserType = (userType) => {
  if (userType === "user" || userType === "guest") return "guest";
  if (["staff", "organizer", "manager"].includes(userType)) return "staff";
  return null;
};

// Function to add a device after checking for duplicate deviceId
function createOrSkipDevice(userId, deviceId, deviceType, app = null) {
  setImmediate(async () => {
    try {
      if (!isPushToken(deviceId)) {
        return;
      }
      deviceId = deviceId.trim();

      // Drop placeholder entries saved by older app versions so they don't
      // pile up next to the real token.
      await Devices.updateOne(
        { userId: userId },
        { $pull: { devices: { deviceId: { $regex: PLACEHOLDER_DEVICE_ID } } } },
      );

      const userDevice = await Devices.findOne({
        userId: userId,
        "devices.deviceId": deviceId,
      });

      const appTag = DEVICE_APPS.includes(app) ? app : null;

      if (userDevice) {
        // Known token: record which app it belongs to (older entries have none)
        if (appTag) {
          await Devices.updateOne(
            { userId: userId, "devices.deviceId": deviceId },
            { $set: { "devices.$.app": appTag } },
          );
        }
        return;
      }

      // If the deviceId doesn't exist, push the new device into the array
      await Devices.updateOne(
        { userId: userId }, // Find the user by userId
        {
          $push: {
            devices: {
              deviceId: deviceId,
              deviceType: deviceType,
              ...(appTag ? { app: appTag } : {}),
            },
          },
        },
        { upsert: true }, // Use upsert to create a new user document if not found
      );
    } catch (error) {
      console.error("Error adding device:", error);
    }
  });
}

module.exports = {
  Devices,
  createOrSkipDevice,
  appFromLoginUserType,
};
