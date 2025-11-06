const mongoose = require("mongoose");

const bannerControlsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["Organizer", "Event", "LoyaltyProgram", "Other"],
      default: "Event",
    },

    // internal field that holds the actual model name used for refPath
    // LoyaltyProgram and Organizer should reference the User model (difference is only for UI)
    objectModel: {
      type: String,
      default: function () {
        if (this.type === "LoyaltyProgram" || this.type === "Organizer") {
          return "User";
        } else if (this.type === "Event") {
          return "Event";
        } else {
          return null; // For "Other", no ref
        }
      },
      select: false, // hide by default in queries
    },

    // object is either a document ref or a simple URL string, depending on type
    object: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      validate: {
        validator: function (v) {
          if (this.type === "Other") {
            // Should be a string (URL)
            return typeof v === "string";
          } else {
            // Should be an ObjectId
            return mongoose.Types.ObjectId.isValid(v);
          }
        },
        message: props => `Invalid object value for type ${props.instance.type}`,
      },
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const BannerControls = mongoose.model("BannerControls", bannerControlsSchema);

module.exports = BannerControls;
