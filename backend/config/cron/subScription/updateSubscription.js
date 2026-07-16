const { User } = require("@UsersModel");

const activateInactiveSubscriptions = async (subScriptions) => {
  const results = [];

  for (const user of subScriptions) {
    const label = user.email || user._id;

    if (!user.inActiveSubscription) {
      continue;
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          activeSubscription: {
            ...user.inActiveSubscription,
            status: "inactive",
            startDate: new Date(),
            endDate: null,
          },
        },
        $unset: { inActiveSubscription: "" },
      },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      continue;
    }

    results.push(updatedUser);
  }

  return results;
};

module.exports = {
  activateInactiveSubscriptions,
};
