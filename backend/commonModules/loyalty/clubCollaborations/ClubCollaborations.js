const mongoose = require("mongoose");

const collaborationSchema = new mongoose.Schema(
  {
    sender: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users", // The user sending the collaboration request
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "expired"],
        default: "pending", // Sender's status
      },
    },
    receiver: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users", // The user receiving the collaboration request
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "expired"],
        default: "pending", // Receiver's status
      },
    },
    notes: {
      type: String,
      default: "",
    },
    expiryDate: {
      type: Date, // Optional: Date when the request expires
    },
  },
  {
    timestamps: true, // Tracks createdAt and updatedAt automatically
  }
);

const Collaboration = mongoose.model("ClubCollaboration", collaborationSchema);

module.exports = Collaboration;
