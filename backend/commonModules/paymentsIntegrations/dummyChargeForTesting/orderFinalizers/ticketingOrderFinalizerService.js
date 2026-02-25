const mongoose = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransactionService } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");
const { sendEventNotification } = require("../../../../controllers/notificationHelper/eventNotificationService");
const { sendMenuOrderNotification } = require("../../../../controllers/notificationHelper/menuOrderNotificationService");
const { sendReservationNotification } = require("../../../../controllers/notificationHelper/reservationNotificationService");
const { fireAndForget } = require("../../../../helperUtils/responseUtil");
const { findAppUserByIdWithProjectionService } = require("../../../../app/usersManagement/usersService");
const { generateQRCode } = require("../../../../helperUtils/qrGenerator");
const { ticketConfirmationEmailTemplate, ticketFailedEmailTemplate } = require("../../../../helperUtils/emailTemplates/ticketingEmailTemplates");
const { sendEmailViaMailgun } = require("../../../../helperUtils/emailUtil");

/**
 * Ticketing Order Finalizer
 * - Source of truth: TicketingOrders
 * - Idempotent
 * - Transaction-safe
 */
const ticketingOrderFinalizerService = async ({ orderId, result }) => {
  const session = await mongoose.startSession();

  let committed = false;
  let order = null;
  let menuOrder = null;
  let userReservation = null;
  let companyPoints = null;
  let globalPoints = null;

  try {
    session.startTransaction();

    // ⛔ Ignore "pending" gateway status
    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    // =====================================================
    // 🔐 ATOMIC IDEMPOTENT STATE TRANSITION (CRITICAL FIX)
    // =====================================================
    order = await TicketingOrders.findOneAndUpdate(
      {
        _id: orderId,
        status: "pendingPayment", // ensures only one webhook wins
      },
      {
        $set: {
          status: result.status === "paid" ? "paid" : "cancelled",
          "paymentDetails.paymentStatus": result.status,
          "paymentDetails.paymentId": result.paymentId || null,
        },
      },
      {
        new: true,
        session,
      }
    );

    // If null → already processed by another webhook
    if (!order) {
      await session.commitTransaction();
      return;
    }

    // Fetch related reservation
    userReservation = await UserReservations
      .findOne({ ticketingOrderRef: orderId })
      .populate("preOrderMenuItemsOrder")
      .session(session);

    menuOrder = userReservation?.preOrderMenuItemsOrder || null;

    // =====================================================
    // ✅ PAYMENT SUCCESS
    // =====================================================
    if (result.status === "paid") {

      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "valid" } },
        { session }
      );

      if (userReservation) {
        await UserReservations.updateOne(
          { _id: userReservation._id },
          {
            $set: {
              status: "confirmed",
              "paymentDetails.paymentStatus": "paid",
              "paymentDetails.paymentId": result.paymentId,
              paidAt: new Date(),
            },
          },
          { session }
        );
      }

      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
          {
            $set: {
              status: "confirmed",
              paymentStatus: "paid",
              paidAt: new Date(),
              transactionId: result.paymentId,
            },
          },
          { session }
        );
      }

      // 🎯 Calculate loyalty points
      const pointsCalculation = await calculatePointsRepo(
        order.user,
        order.companyOrganizer,
        order.orderPricing.total
      );

      globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: pointsCalculation.global.globalMultiplier || 1,
        total: pointsCalculation.global.earnedPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
      };

      companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
        total: pointsCalculation.organizer.earnedPoints,
        pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
      };

      const trxData = {
        user: order.user,
        companyOrganizer: order.companyOrganizer,
        organization: order.organization,
        companyPoints,
        globalPoints,
        allowNegative: false,
        type: "earn",
        description: "Booked tickets.",
        entityId: order._id,
        domainType: "ticketingorders",
      };

      const trx = await createTransactionService(trxData, session);

      if (!trx.success) {
        console.error("Transaction creation failed:", trx);
        throw new Error(trx.message || "wallet_update_failed");
      }


      /* try {
        // =====================================================
        // 📧 TICKET CONFIRMATION EMAIL
        // =====================================================

        const userDetails =
          await findAppUserByIdWithProjectionService(
            order.user,
            { email: 1, timezone: 1, username: 1 }
          );

        const bookings = await TicketingBookings
          .find({ order: order._id })
          .populate("organization")
          .lean();

        if (!bookings?.length) return;

        // 🔹 Extract eventId from snapshot (ObjectId)
        const eventId = bookings[0]?.ticket?.snapshot?.event;

        let event = null;

        if (eventId) {
          event = await mongoose
            .model("Event")
            .findById(eventId)
            .select("basicInfo schedule")
            .lean();
        }

        const formattedTickets = [];

        for (const booking of bookings) {

          const qrPayload = {
            v: 1,
            type: "ticket",
            ticketBookingId: booking.ticketBookingId,
            orderId: order._id,
            userId: booking.user,
            organizationId: booking.organization?._id,
            companyOrganizerId: booking.companyOrganizer,
            eventId: eventId,
          };

          const qrCode = await generateQRCode(qrPayload);

          formattedTickets.push({
            ticketBookingId: booking.ticketBookingId,
            qrCode,
          });
        }

        const html = ticketConfirmationEmailTemplate({
          userName: userDetails.username,
          organizationName: bookings[0]?.organization?.basicInfo?.name,
          eventTitle: event?.basicInfo?.title || "",
          eventDate: event?.schedule?.startDateTime || "",
          eventTime: "",
          venue: event?.basicInfo?.venueLocation?.address || "",
          tickets: formattedTickets,
          orderPricing: order.orderPricing,
        });

        await sendEmailViaMailgun(
          "cwaliimrandev@gmail.com", // replace with userDetails.email in prod
          "Your tickets are confirmed",
          html
        );

      } catch (err) {
        console.error("[EMAIL] Ticket confirmation email failed:", err);
      } */
    }

    // =====================================================
    // ❌ PAYMENT FAILED
    // =====================================================
    if (result.status === "failed") {

      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "cancelled" } },
        { session }
      );

      if (userReservation) {
        await UserReservations.updateOne(
          { _id: userReservation._id },
          {
            $set: {
              status: "cancelled",
              "paymentDetails.paymentStatus": "failed",
            },
          },
          { session }
        );
      }

      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
          {
            $set: {
              status: "cancelled",
              paymentStatus: "failed",
            },
          },
          { session }
        );
      }

     /*  try {
        const userDetails =
          await findAppUserByIdWithProjectionService(
            order.user,
            { email: 1, timezone: 1, username: 1 }
          );

        const bookings = await TicketingBookings
          .find({ order: order._id })
          .lean();

        const event = bookings[0]?.ticket?.snapshot?.event;

        const html = ticketFailedEmailTemplate({
          userName: userDetails.username,
          eventTitle: event?.basicInfo?.title,
          orderPricing: order.orderPricing,
        });

        await sendEmailViaMailgun(
          "cwaliimrandev@gmail.com",//userDetails.email,
          "Ticket payment failed",
          html
        );

      } catch (err) {
        console.error("[EMAIL] Ticket failed email error:", err);
      } */


    }

    await session.commitTransaction();
    committed = true;

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
  // =====================================================
  // 🚀 POST-COMMIT SIDE EFFECTS (OUTSIDE TRANSACTION)
  // =====================================================
  if (committed && order) {

    /**
     * =====================================================
     * 🎯 Loyalty Side Effects (Non-blocking)
     * =====================================================
     */
    try {
      handleLoyaltyEarningConsequences({
        userId: order.user,
        companyOrganizer: order.companyOrganizer,
        companyPoints,
        globalPoints,
        menuOrder: order
      });
    } catch (err) {
      console.error("[LOYALTY] Side effect failed:", err);
    }


    /**
     * =====================================================
     * 🔔 Event Notifications (Fire & Forget)
     * =====================================================
     */

    // Only if this order is linked to an event
    if (order.event) {

      // PAYMENT SUCCESS
      if (order.status === "paid") {
        fireAndForget(
          sendEventNotification({
            eventId: order.event,
            action: "TICKET_CONFIRMED",
            userIds: [order.user],
            context: {
              ticketsPurchased: order.ticketsPurchased,
            },
          }),
          "TICKET_CONFIRMED_NOTIFICATION"
        );
      }

      // PAYMENT FAILED / CANCELLED
      if (order.status === "cancelled") {
        fireAndForget(
          sendEventNotification({
            eventId: order.event,
            action: "TICKET_CANCELLED",
            userIds: [order.user],
          }),
          "TICKET_CANCELLED_NOTIFICATION"
        );
      }
    }


    /**
    * =====================================================
    * 🟢 Reservation Notifications
    * =====================================================
    */
    if (userReservation) {

      if (result.status === "paid") {
        fireAndForget(
          sendReservationNotification({
            reservationId: userReservation._id,
            action: "RESERVATION_CONFIRMED",
          }),
          "RESERVATION_CONFIRMED_NOTIFICATION"
        );
      }

      if (result.status === "failed") {
        fireAndForget(
          sendReservationNotification({
            reservationId: userReservation._id,
            action: "RESERVATION_CANCELLED",
          }),
          "RESERVATION_CANCELLED_NOTIFICATION"
        );
      }
    }




    /**
  * =====================================================
  * 🟡 Menu Order Notifications
  * =====================================================
  */
    if (menuOrder) {

      if (result.status === "paid") {
        fireAndForget(
          sendMenuOrderNotification({
            orderId: menuOrder._id,
            action: "MENU_ORDER_CONFIRMED",
          }),
          "MENU_ORDER_CONFIRMED_NOTIFICATION"
        );
      }

      if (result.status === "failed") {
        fireAndForget(
          sendMenuOrderNotification({
            orderId: menuOrder._id,
            action: "MENU_ORDER_CANCELLED",
          }),
          "MENU_ORDER_CANCELLED_NOTIFICATION"
        );
      }
    }


  }


};


module.exports = { ticketingOrderFinalizerService };
