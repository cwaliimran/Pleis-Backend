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
        enum: ["pending", "accept", "reject", "cancel", "expired"],
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
        enum: ["pending", "accept", "reject", "cancel", "expired"],
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
friendRequestSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const { sender, receiver } = this._update;

    // Extract user ids to check
    const senderId = sender?.id || this.sender?.id;
    const receiverId = receiver?.id || this.receiver?.id;

    if (!senderId || !receiverId) return next();

    // Prevent sending a request to yourself
    if (senderId === receiverId) {
      return next(new Error("You cannot send a request to yourself."));
    }

    // Check if a friend request already exists with "pending" status
    const existing = await mongoose.model("FriendRequest").findOne({
      "sender.id": senderId,
      "receiver.id": receiverId,
    });

    if (existing && existing.sender.status === "pending") {
      return next(new Error("Friend request already sent."));
    }

    const reverse = await mongoose.model("FriendRequest").findOne({
      "sender.id": receiverId,
      "receiver.id": senderId,
    });

    if (reverse && reverse.sender.status === "pending") {
      return next(new Error("This person already sent you a request. Please accept it."));
    }

    next();
  } catch (err) {
    next(err);
  }
});


const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);

module.exports = FriendRequest;
