const { UserReservations } = require("@UserReservationsModel");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Give back the reservation voucher amount an order drew at place time
 * (priceBreakdown.voucherDiscount) when that order dies before it is paid:
 * the pay-now window expired or the Monri payment failed.
 *
 * Only a live voucher (pending / applied) gets the amount back. An expired,
 * cancelled or forfeited voucher stays as it is. Call it in the same
 * transaction as the order status change, so it runs once per order.
 *
 * Returns the amount released (0 when nothing was released).
 */
async function releaseOrderVoucher({ order, session }) {
  const draw = round2(order?.priceBreakdown?.voucherDiscount || 0);
  if (!order?.reservation || draw <= 0) return 0;

  const reservation = await UserReservations.findById(order.reservation)
    .select("voucher")
    .session(session);
  const voucher = reservation?.voucher;
  if (!voucher || !["pending", "applied"].includes(voucher.status)) return 0;

  const total = round2(voucher.discountAmount || 0);
  const used = round2(voucher.usedAmount || 0);
  const released = round2(Math.min(draw, used));
  if (released <= 0) return 0;
  const newUsed = round2(used - released);

  // Optimistic lock on usedAmount, as consumeReservationVoucher does: a
  // concurrent order on the same voucher aborts this run and the next one retries.
  const updated = await UserReservations.findOneAndUpdate(
    {
      _id: order.reservation,
      "voucher.status": voucher.status,
      "voucher.usedAmount": voucher.usedAmount ?? 0,
    },
    {
      $set: {
        "voucher.usedAmount": newUsed,
        "voucher.status": round2(total - newUsed) > 0 ? "pending" : "applied",
      },
    },
    { session, new: true },
  );
  if (!updated) {
    const err = new Error("voucher_balance_changed");
    err.code = "VOUCHER_BALANCE_CHANGED";
    throw err;
  }
  return released;
}

module.exports = { releaseOrderVoucher };
