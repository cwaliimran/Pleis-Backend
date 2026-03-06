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
const triggerBadgeEngine = require("@triggerGlobalStreak");

/**
 * Ticketing Order Finalizer
 * - Source of truth: TicketingOrders
 * - Idempotent
 * - Transaction-safe
 */
const ticketingOrderFinalizerService = async ({ orderId, result }) => {
  const session = await mongoose.startSession();
  console.log("result---->", result)
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
          "paymentDetails.transactionId": result.transactionId || null,
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
      console.log("[TICKETING] Payment status is 'paid'. Updating bookings...");
      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "valid" } },
        { session }
      );

      if (userReservation) {
        console.log("[TICKETING] Updating user reservation to 'confirmed'...");
        await UserReservations.updateOne(
          { _id: userReservation._id },
          {
            $set: {
              status: "confirmed",
              "paymentDetails.paymentStatus": "paid",
              "paymentDetails.transactionId": result.transactionId,
              paidAt: new Date(),
            },
          },
          { session }
        );
      }

      if (menuOrder) {
        console.log("[TICKETING] Updating menu order to 'confirmed'...");
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
          {
            $set: {
              status: "confirmed",
              paymentStatus: "paid",
              paidAt: new Date(),
              transactionId: result.transactionId,
            },
          },
          { session }
        );
      }

      // 🎯 Calculate loyalty points
      console.log("[TICKETING] Calculating loyalty points...");
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

      console.log("[TICKETING] Creating wallet transaction...");
      const trx = await createTransactionService(trxData, session);

      if (!trx.success) {
        console.error("[TICKETING] Transaction creation failed:", trx);
        throw new Error(trx.message || "wallet_update_failed");
      }

      try {
        // =====================================================
        // 📧 TICKET CONFIRMATION EMAIL
        // =====================================================
        console.log("[TICKETING] Preparing ticket confirmation email...");

        const userDetails =
          await findAppUserByIdWithProjectionService(
            order.user,
            { email: 1, timezone: 1, username: 1 }
          );
        const bookings = await TicketingBookings
          .find({ order: order._id })
          .populate("organization")
          .lean();

        console.log("[EMAIL] Bookings fetched:", {
          count: bookings?.length,
          sample: bookings?.[0] ? {
            ticketBookingId: bookings[0].ticketBookingId,
            organizationName: bookings[0]?.organization?.basicInfo?.name,
            snapshotEvent: bookings[0]?.ticket?.snapshot?.event,
          } : null
        });
        if (!bookings?.length) {
          console.log("[TICKETING] No bookings found for order, skipping email.");
          return;
        }

        // 🔹 Extract eventId from snapshot (ObjectId)
        const eventId = bookings[0]?.ticket?.snapshot?.event;

        let event = null;

        if (eventId) {
          console.log("[TICKETING] Fetching event details for email...");
          event = await mongoose
            .model("Event")
            .findById(eventId)
            .select("basicInfo schedule")
            .lean();
        }

        const formattedTickets = [];

        for (const booking of bookings) {
          formattedTickets.push({
            ticketBookingId: booking.ticketBookingId,
          });
        }

        console.log("[TICKETING] Rendering email template...");
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

        let email = "cwaliimrandev@gmail.com"
        if (process.env.NODE_ENV != "dev") {
          email = userDetails.email
        }
        console.log(`[TICKETING] Sending confirmation email to: ${email}`);
        await sendEmailViaMailgun(
          email,
          "Your tickets are confirmed",
          html
        );

      } catch (err) {
        console.error("[EMAIL] Ticket confirmation email failed:", err);
      }
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

      try {
        console.log("[EMAIL] Preparing FAILED payment email (DEV MODE)...");

        const userDetails =
          await findAppUserByIdWithProjectionService(
            order.user,
            { email: 1, username: 1 }
          );

        const bookings = await TicketingBookings
          .find({ order: order._id })
          .lean();

        // Extract eventId from snapshot
        const eventId = bookings?.[0]?.ticket?.snapshot?.event;

        let eventTitle = "Event";

        if (eventId) {
          const event = await mongoose
            .model("Event")
            .findById(eventId)
            .select("basicInfo.title")
            .lean();

          eventTitle = event?.basicInfo?.title || "Event";
        }

        const html = ticketFailedEmailTemplate({
          userName: userDetails?.username || "User",
          eventTitle,
          orderPricing: order.orderPricing,
        });


        let email = "cwaliimrandev@gmail.com"
        if (process.env.NODE_ENV != "dev") {
          email = userDetails.email
        }

        await sendEmailViaMailgun(
          email,
          "Ticket payment failed (DEV)",
          html
        );

      } catch (err) {
        console.error("[EMAIL] Ticket failed email error:", err);
      }


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

    if (order.orderPricing?.total && order.orderPricing.total > 0) {
      fireAndForget(
        triggerBadgeEngine(order.user, {
          category: "singlePurchase",
          amount: order.orderPricing.total,
        }),
        "TRIGGER_BADGE_ENGINE"
      );
    }

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
