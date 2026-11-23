/**
 * Monri charges in minor units (cents). A redirect fulfill used to save that
 * figure on the webhook row (20000) while the order document stays in euros
 * (200). Card and Apple Pay rows were already stored in euros by the app.
 * When the webhook figure is exactly 100× the order total, the euro total wins.
 */

function eurosFromStoredPayment(webhookAmount, orderEuros) {
  const raw = Number(webhookAmount);
  const order = Number(orderEuros);
  if (!Number.isFinite(raw)) return webhookAmount ?? 0;
  if (!Number.isFinite(order) || order <= 0) return raw;
  const cents = Math.round(Number((order * 100).toFixed(6)));
  if (Math.round(raw) === cents && cents !== Math.round(order)) return order;
  return raw;
}

/** Monri minor units → euro string ("20000" → "200.00"). */
function monriMinorToEuros(amount) {
  const minor = Number(amount);
  if (!Number.isFinite(minor)) return amount;
  return (Math.round(minor) / 100).toFixed(2);
}

/**
 * Aggregation expression. `orderAmountExpr` is a field path ("$reservation.amount")
 * or any expression that yields the order total in euros.
 */
function paymentAmountExpression(orderAmountExpr) {
  return {
    $let: {
      vars: {
        webhookAmount: {
          $convert: { input: "$amount", to: "double", onError: 0, onNull: 0 },
        },
        orderAmount: orderAmountExpr,
      },
      in: {
        $cond: [
          {
            $and: [
              { $isNumber: "$$orderAmount" },
              { $gt: ["$$orderAmount", 0] },
              {
                $eq: [
                  { $round: ["$$webhookAmount", 0] },
                  { $round: [{ $multiply: ["$$orderAmount", 100] }, 0] },
                ],
              },
              {
                $ne: [
                  { $round: ["$$webhookAmount", 0] },
                  { $round: ["$$orderAmount", 0] },
                ],
              },
            ],
          },
          "$$orderAmount",
          "$$webhookAmount",
        ],
      },
    },
  };
}

/** Pipeline stages: reservation webhook cents → the reservation's euro total. */
function correctedReservationAmountStages() {
  return [
    {
      $lookup: {
        from: "userreservations",
        let: { orderId: "$orderNumber", kind: "$orderType" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$$kind", "userreservations"] },
                  { $eq: ["$_id", "$$orderId"] },
                ],
              },
            },
          },
          { $project: { _id: 0, amount: 1 } },
        ],
        as: "_reservationPay",
      },
    },
    {
      $addFields: {
        amount: {
          $toString: paymentAmountExpression({
            $arrayElemAt: ["$_reservationPay.amount", 0],
          }),
        },
      },
    },
    { $unset: "_reservationPay" },
  ];
}

module.exports = {
  eurosFromStoredPayment,
  monriMinorToEuros,
  paymentAmountExpression,
  correctedReservationAmountStages,
};
