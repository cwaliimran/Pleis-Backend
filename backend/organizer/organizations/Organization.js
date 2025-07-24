const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    basicInfo: {
      media: {
        logo: {
          type: String,
          default: "",
        },
        cover: {
          type: String,
          default: "",
        },
      },
      name: {
        type: String,
        trim: true,
        required: true,
        default: "",
      },
      description: {
        type: String,
        trim: true,
        default: "",
      },
      socialLinks: {
        youtube: {
          type: String,
          default: "",
        },
        facebook: {
          type: String,
          default: "",
        },
        instagram: {
          type: String,
          default: "",
        },
        linkedin: {
          type: String,
          default: "",
        },
      },
    
    },

    otherInfo: {
        minAge: {
        type: Number,
        default: 0,
      },
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

const Organizations = mongoose.model("Organizations", organizationSchema);

module.exports = Organizations;
