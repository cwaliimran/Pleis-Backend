

const Organizations = require("@OrganizationModel");
const mongoose = require("mongoose");

const getOrganizationsAsStaff = async (userId) => {
  // fix wrapper object { userId: ... }
  userId = userId?.userId || userId;

  userId = new mongoose.Types.ObjectId(userId);

  let organizations = [];

  try {
    organizations = await Organizations.find({
      $or: [
        { creator: userId },
        { "staff.user": userId }
      ]
    })
      .select("basicInfo staff creator")
      .lean();
  } catch (err) {
    throw err;
  }

  if (!Array.isArray(organizations)) {
    return [];
  }

  return organizations.map((org) => {
    const staffArray = Array.isArray(org.staff) ? org.staff : [];

    if (org.creator?.toString() === userId.toString()) {
      return {
        ...org,
        staff: staffArray
      };
    }

    return {
      ...org,
      staff: staffArray.filter(
        (s) => s?.user?.toString() === userId.toString()
      ),
    };
  });
};



module.exports = {

  getOrganizationsAsStaff,

};
