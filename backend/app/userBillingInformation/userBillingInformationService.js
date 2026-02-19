const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const UserBillingInformationRepo = require("./userBillingInformationRepository");


const createUserBillingInformation = async (data) => {
  let userBillingInformation = await UserBillingInformationRepo.createUserBillingInformation(data);
  return userBillingInformation;
};
const getUserBillingInformations = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { UserBillingInformations, meta } = await UserBillingInformationRepo.getUserBillingInformations({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    UserBillingInformations,
    meta
  };
};
const updateUserBillingInformation = async (id, data) => {
  const userBillingInformation = await UserBillingInformationRepo.findUserBillingInformationById(id);
  
  console.log("id, data", id, data); // Debugging output
  
  if (!userBillingInformation) {
    return { error: "UserBillingInformation_not_found" };
  }

  /* ================= ALLOWED FIELDS ================= */

  const allowedFields = [
    "email",
    "billingAddress", // billingAddress will be updated as an object
    "status",
  ];

  /* ================= APPLY UPDATE FIELDS ================= */

  const updateData = {};

  // Loop through allowed fields and check if they are provided in the `data` object
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      // If the field is billingAddress, we need to handle it as an object
      if (key === "billingAddress" && typeof data[key] === "object") {
        // If billingAddress is provided, merge the existing billingAddress object with new values
        userBillingInformation.billingAddress = {
          ...userBillingInformation.billingAddress,
          ...data[key], // This will only update the fields provided (e.g., address, city, etc.)
        };
      } else {
        // For other fields, directly assign the data
        updateData[key] = data[key];
      }
    }
  }

  // Nothing to update
  if (Object.keys(updateData).length === 0 && !data.billingAddress) {
    return userBillingInformation; // No changes to apply, return existing object
  }

  // If updateData has any changes, merge it with the existing document
  Object.assign(userBillingInformation, updateData);

  /* ================= APPLY & SAVE ================= */

  // Save the document to apply the changes (schema validation will run here)
  await userBillingInformation.save();

  return userBillingInformation;
};



const deleteUserBillingInformation = async (id) => {
  if (!id) throw new Error("UserBillingInformation ID is required");
  const deleted = await UserBillingInformationRepo.updateBadgeStatusById(
    id,
    "deleted"
  );
  return !!deleted;
};
module.exports = {
  createUserBillingInformation,
  getUserBillingInformations,
  updateUserBillingInformation,
  deleteUserBillingInformation,

};