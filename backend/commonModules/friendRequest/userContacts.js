const mongoose = require("mongoose");

const usercontactsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
        required: true,
        unique: true,
    },
    phoneNumbers: [
        {
          type: String,
          required: true,
        }
    ],
  },
  { timestamps: true }      
);
const UserContacts = mongoose.model("UserContacts", usercontactsSchema);

module.exports = {
  UserContacts,
  }