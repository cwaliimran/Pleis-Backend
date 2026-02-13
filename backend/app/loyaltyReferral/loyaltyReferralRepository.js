const { User } = require("../../models/UserModel");

const getUserOrganizationPublicIds = async (userId, organization) => {
  try {
    const user = await User.findById(userId).select("publicId");
    if (!user) {
      return { userPublicId: null, organizationPublicIds: [] };
    }

     const organizationPublicIds = await User.findById(organization).select("publicId");
    return {
      userPublicId: user.publicId,
      organizationPublicIds: organizationPublicIds.publicId,
    };


  } catch (err) {

    throw err;
  }
};


const saveUserReferralData = async (organizer,referrer) => {
  try {
    const organizerUser = await User.findOne({ publicId: organizer });
    const referrerUser = await User.findOne({ publicId: referrer });
    if (!organizerUser) {
      throw new Error("User not found");
    }
    if (!referrerUser) {
      throw new Error("Referrer not found");
    } 
     const organizerId = organizerUser._id;
     const referrerId = referrerUser._id;

    return { organizerId, referrerId };
  } catch (err) {
   
    throw err;
  }
};

module.exports = {

  getUserOrganizationPublicIds,
  saveUserReferralData
};