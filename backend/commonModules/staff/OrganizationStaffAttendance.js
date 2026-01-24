const mongoose = require("mongoose");

const OrganizationStaffAttendanceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },

    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // Organization-local date (YYYY-MM-DD)
    attendanceDate: {
      type: String,
      required: true,
      index: true
    },

    // 🔹 CURRENT STATE
    status: {
      type: String,
      enum: ["checkedIn", "checkedOut"],
      default: "checkedOut",
      index: true
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

// 🔒 One record per staff per organization per day
OrganizationStaffAttendanceSchema.index(
  { organization: 1, staff: 1, attendanceDate: 1 },
  { unique: true }
);

const OrganizationStaffAttendance = mongoose.model(
  "OrganizationStaffAttendance",
  OrganizationStaffAttendanceSchema
);

module.exports = { OrganizationStaffAttendance };
