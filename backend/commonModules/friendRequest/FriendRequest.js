const mongoose = require("mongoose");

const friendRequestSchema = new mongoose.Schema(
  {
    sender: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "cancelled", "expired"],
        default: "pending",
      },
    },

    receiver: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "cancelled", "expired"],
        default: "pending",
      },
    },

    notes: { type: String, default: "" },
    expiryDate: { type: Date },
  },
  { timestamps: true }
);

// -----------------------------------------------
// 🚫 PREVENT DUPLICATES (sender → receiver)
// -----------------------------------------------
friendRequestSchema.index(
  { "sender.id": 1, "receiver.id": 1 },
  { unique: true }
);


// -----------------------------------------------
// 🚀 PRE-SAVE VALIDATIONS (ALL LOGIC HERE)
// -----------------------------------------------
friendRequestSchema.pre("save", async function (next) {
  try {
    const senderId = this.sender.id.toString();
    const receiverId = this.receiver.id.toString();

    // 1️⃣ Prevent sending to yourself
    if (senderId === receiverId) {
      return next(new Error("You cannot send a request to yourself."));
    }

    // 2️⃣ Check if sender already sent request before
    const existing = await mongoose.model("FriendRequest").findOne({
      "sender.id": senderId,
      "receiver.id": receiverId,
    });

    if (existing) {
      if (existing.sender.status === "pending") {
        return next(new Error("Friend request already sent."));
      }
      if (existing.sender.status === "accepted") {
        return next(new Error("You are already friends."));
      }
    }

    // 3️⃣ Check if receiver already sent request
    const reverse = await mongoose.model("FriendRequest").findOne({
      "sender.id": receiverId,
      "receiver.id": senderId,
    });

    if (reverse) {
      if (reverse.sender.status === "pending") {
        return next(new Error("This person already sent you a request. Please accept it."));
      }
      if (reverse.sender.status === "accepted") {
        return next(new Error("You are already friends."));
      }
    }

    next();

  } catch (err) {
    next(err);
  }
});


const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);

module.exports = FriendRequest;
