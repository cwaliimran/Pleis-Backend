const { User } = require("@UsersModel");

const activateInactiveSubscriptions = async (subScriptions) => {
  for (const user of subScriptions) {
    if (user.inActiveSubscription) {
      const updatedUser = await User.findByIdAndUpdate(
        user._id,  // User ID for the update
        {
          $set: {
            activeSubscription: {
              ...user.inActiveSubscription,
              status: "inactive",
              startDate: new Date(),
              endDate: null,
            },
          },
        },
        { new: true } // return the updated document
      );


    }
  }
};

module.exports = {
  activateInactiveSubscriptions,
};