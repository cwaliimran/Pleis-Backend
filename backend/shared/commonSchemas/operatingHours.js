const { default: mongoose } = require("mongoose");

const timingSchema = {
  from: { type: String, default: "" },
  to: { type: String, default: "" },
  break: {
    from: { type: String, default: "" },
    to: { type: String, default: "" },
  },
  isOpen: { type: Boolean, default: false },
};
const OperatingHoursSchema = new mongoose.Schema({
    monday: timingSchema,
    tuesday: timingSchema,
    wednesday: timingSchema,
    thursday: timingSchema,
    friday: timingSchema,
    saturday: timingSchema,
    sunday: timingSchema,
});

module.exports = {
  OperatingHoursSchema,
};
