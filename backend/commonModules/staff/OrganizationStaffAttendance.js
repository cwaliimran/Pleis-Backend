const mongoose = require("mongoose");

const OrganizationStaffAttendanceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Organization-local date (YYYY-MM-DD)
    attendanceDate: {
      type: String,
      required: true,
    },

    // 🔹 CURRENT STATE
    status: {
      type: String,
      enum: ["checkedIn", "checkedOut"],
      default: "checkedOut",
    },

    // 🔹 DAILY HISTORY (MULTIPLE IN/OUT)
    history: [
      {
        type: {
          type: String,
          enum: ["checkIn", "checkOut"],
          required: true
        },

        at: {
          type: Date,
          required: true,
          default: Date.now
        },

        source: {
          type: String,
          enum: ["manual", "qr", "auto"],
          default: "manual"
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

OrganizationStaffAttendanceSchema.index({
  organization: 1,
  staff: 1,
  status: 1,
  attendanceDate: 1
});


const OrganizationStaffAttendance = mongoose.model(
  "OrganizationStaffAttendance",
  OrganizationStaffAttendanceSchema
);

module.exports = { OrganizationStaffAttendance };
