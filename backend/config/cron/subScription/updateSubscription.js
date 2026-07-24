const {
  User,
  SubscriptionTypes,
  SubscriptionPaymentStatuses,
} = require("@UsersModel");

const buildPendingSubscriptionTypePayments = (subscription) => {
  const types = [...new Set(subscription.subscriptionTypes || [])];
  const previousByType = new Map(
    (subscription.subscriptionTypePayments || []).map((payment) => [
      payment.subscriptionType,
      payment,
    ])
  );

  return types.map((subscriptionType) => {
    if (subscriptionType === SubscriptionTypes.FREE) {
      return {
        subscriptionType: SubscriptionTypes.FREE,
        status: SubscriptionPaymentStatuses.NOT_REQUIRED,
        amount: 0,
        currency: "EUR",
        paymentReference: null,
        providerTransactionId: null,
        paidAt: null,
        failedAt: null,
        failureReason: null,
      };
    }

    const existing = previousByType.get(subscriptionType);

    return {
      subscriptionType,
      status: SubscriptionPaymentStatuses.PENDING,
      amount: existing?.amount ?? 0,
      currency: existing?.currency || "EUR",
      paymentReference: null,
      providerTransactionId: null,
      paidAt: null,
      failedAt: null,
      failureReason: null,
    };
  });
};

const activateInactiveSubscriptions = async (subScriptions) => {
  const results = [];

  for (const user of subScriptions) {
    if (!user.inActiveSubscription) {
      continue;
    }

    const inactiveSubscription = user.inActiveSubscription;
    const subscriptionTypePayments =
      buildPendingSubscriptionTypePayments(inactiveSubscription);

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          activeSubscription: {
            ...inactiveSubscription,
            status: "pending",
            startDate: new Date(),
            endDate: null,
            subscriptionTypePayments,
          },
        },
        $unset: { inActiveSubscription: "" },
      },
      { new: true, runValidators: true }
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
