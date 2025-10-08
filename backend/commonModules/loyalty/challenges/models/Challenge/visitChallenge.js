const Challenge = require("./baseChallenge");
const mongoose = require("mongoose");

const VisitChallenge = Challenge.discriminator(
  "visit",
  new mongoose.Schema({}, { _id: false }) // no extra fields
);

module.exports = VisitChallenge;
