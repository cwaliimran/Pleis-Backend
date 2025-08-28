const mongoose = require("mongoose");

const tagsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
      // Remove unique from schema, enforce in custom validator
      validate: {
        validator: async function (value) {
          // Only check uniqueness if status is not 'deleted'
          if (this.status === "deleted") return true;
          const count = await mongoose.models.Tags.countDocuments({
            title: value,
            status: { $ne: "deleted" },
            _id: { $ne: this._id }
          });
          return count === 0;
        },
        message: "Title must be unique."
      }
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
    type: {
      type: String,
      enum: ["primary", "success", "warning", "danger"],
      default: "primary",
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Tags = mongoose.model("Tags", tagsSchema);

module.exports = Tags;
