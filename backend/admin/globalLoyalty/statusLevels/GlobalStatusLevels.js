const mongoose = require("mongoose");

const globalStatusLevelsSchema = new mongoose.Schema(
  {

    image: {
      type: String,
      default: "",
    },
        backgroundImage: {
      type: String,
      default: "",
    },


    title: {
      type: String,
      trim: true,
      required: true,
      default: "",
    },

    type: {
      type: String,
      enum: ["blue", "silver", "gold", "platinum", "black"],
      default: "blue",
    },

    bonusPointsPerEuro: {
      type: Number,
      default: 0,
    },

    entryPoints: {
      type: Number,
      default: 0,
    },
    retainPoints: { //how much you need to stay in this level in an year
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,

  }
);


const GlobalStatusLevels = mongoose.model("GlobalStatusLevels", globalStatusLevelsSchema);

module.exports = GlobalStatusLevels;
