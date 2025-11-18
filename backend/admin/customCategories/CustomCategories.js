const mongoose = require("mongoose");

const customCategoriesSchema = new mongoose.Schema(
  {

    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
      unique: true,
    },
    type: {
      type: String,
      enum: ["Event", "User", "Organizations"], //"User" -> LoyaltyClub
      default: "Event",
    },
    //type refers to schemas and it will be an array of object ids
    objects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "type",
      },
    ],
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

const CustomCategories = mongoose.model("CustomCategories", customCategoriesSchema);

module.exports = CustomCategories;
