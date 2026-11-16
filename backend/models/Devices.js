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

// Function to add a device after checking for duplicate deviceId
function createOrSkipDevice(userId, deviceId, deviceType) {
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

      if (userDevice) {
        return; // Device already exists, so skip adding it
      }

      // If the deviceId doesn't exist, push the new device into the array
      await Devices.updateOne(
        { userId: userId }, // Find the user by userId
        { $push: { devices: { deviceId: deviceId, deviceType: deviceType } } }, // Add the new device
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
};
