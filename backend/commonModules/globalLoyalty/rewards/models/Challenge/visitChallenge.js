const GlobalChallenge = require("./BaseChallenge");
const mongoose = require("mongoose");

const VisitChallenge = GlobalChallenge.discriminator(
  "visit",
  new mongoose.Schema({
     taskValue: { type: Number, default: 1 }, 
  }, { _id: false }) // no extra fields
);

module.exports = VisitChallenge;
