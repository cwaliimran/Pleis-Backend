const { getUserDetailsForQRService } = require("../../admin/usersManagement/usersService");
const { getTicketingBookingByIdService } = require("../../app/bookings/ticketings/ticketingBookingService");
const { getUserCompanyWallet } = require("../../app/loyalty/clubMembers/clubMembersService");
const { sendResponse, validateParams } = require("@utils/responseUtil");
const { User } = require("@UserModel");
const { getUserReservationDetailsService } = require("../../app/reservations/reservationService");
const { getLoyaltyRewardOrderDetailsService } = require("../../app/loyalty/rewardsOrders/rewardsOrdersService");
const { resolveBuyMenuItemRewardAvailability } = require("../../app/loyalty/rewards/utils/equivalentMenuItems");
const scanQrController = async (req, res) => {
  try {
    const { timezone } = req.user;

    const { qrData } = req.body;
    const { publicId, user, companyOrganizer, organization, type = "loyaltyCard", id } = qrData;

    let validateData = {
      rawData: [
        "qrData.companyOrganizer",
        "qrData.type",
      ],
      enumFields: {
        "qrData.type": ["loyaltyCard", "loyaltyCardManual", "eventTicket", "userReservation", "loyaltyReward"],
      },
    };
    const user_id = await User.findById(companyOrganizer);


    if (type === "loyaltyCard") {
      validateData.rawData.push("qrData.user");
      if (
        !validateParams(req, res, validateData)
      ) return;

      let [wallet, userDetails] = await Promise.all([
        getUserCompanyWallet(user, companyOrganizer),
        getUserDetailsForQRService(user)
      ]);

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "qr_code_scanned_successfully",
        data: {
          wallet,
          userDetails
        },
      });
    }
    else if (type === "loyaltyCardManual") {
      validateData.rawData.push("qrData.publicId");
      if (
        !validateParams(req, res, validateData)
      ) return;

      const user = await User.findOne({ publicId }).select("_id").lean();
      if (!user) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "user_not_found",
        });
      }

      let [wallet, userDetails] = await Promise.all([
        getUserCompanyWallet(user._id, companyOrganizer),
        getUserDetailsForQRService(user._id)
      ]);

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "qr_code_scanned_successfully",
        data: {
          wallet,
          userDetails
        },
      });
    }
    else if (type === "eventTicket") {
      const ticketLookupId = id || qrData.ticketBookingId || qrData.bookingId;
      if (!ticketLookupId) validateData.rawData.push("qrData.id");
      validateData.rawData.push("qrData.organization");

      if (
        !validateParams(req, res, validateData)
      ) return;

      const { organization } = qrData;

      let eventTicket = await getTicketingBookingByIdService(ticketLookupId, timezone);
      if (!eventTicket) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "ticket_not_found",
        });
      }
      let warnings = [];
      if (user_id.companyDetails.status !== "active") {
        warnings.push({
          warning: "Company is not active",
          warningCode: "company_inactive",
        });
      }
      //or organization mismatch
      if (eventTicket.organization._id.toString() !== organization.toString()) {
        warnings.push({
          warning: "Organization mismatch for the ticket",
          warningCode: "organization_mismatch"
        });
      }
      if (eventTicket?.order?.paymentDetails?.paymentStatus !== "paid") {
        warnings.push({
          warning: "Ticket payment is not completed",
          warningCode: "payment_not_completed"
        });
      }

      if (eventTicket.status !== "valid") {
        warnings.push({
          warning: `Ticket status is ${eventTicket.status}`,
          warningCode: "invalid_ticket_status"
        });
      }

      if (eventTicket?.ticket?.snapshot?.repeatable?.isRepeatable) {
        const visits = eventTicket.ticket.snapshot.repeatable.visits || 0;

        if (visits <= 0) {
          warnings.push({
            warning: "No remaining visits on this ticket",
            warningCode: "no_remaining_visits"
          });
        }
      }



      // Preview only — check-in (staff/events checkIn) consumes the ticket and
      // enqueues ticketing_invoices for paid orders (see fiscalTiming).
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "qr_code_scanned_successfully",
        data: {
          eventTicket,
          warnings
        },
      });
    }
    else if (type === "userReservation") {
      const reservationLookupId = id || qrData.bookingId;
      if (!reservationLookupId) validateData.rawData.push("qrData.id");
      if (!validateParams(req, res, validateData)) return;

      const reservationData =
        await getUserReservationDetailsService(reservationLookupId, timezone);

      if (!reservationData?.reservation) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "user_reservation_not_found",
        });
      }

      const companyWallet = await getUserCompanyWallet(reservationData.reservation.userId, reservationData.reservation.companyOrganizer)

      let warnings = [];
      const reservation = reservationData.reservation;
      if (user_id.companyDetails.status !== "active") {
        warnings.push({
          warning: "Company is not active",
          warningCode: "company_inactive",
        });
      }


      if (
        reservation.companyOrganizer?.toString() !==
        companyOrganizer?.toString()
      ) {
        warnings.push({
          warning: "Organizer mismatch for reservation",
          warningCode: "organizer_mismatch",
        });
      }

      // if (reservation.status !== "checkedIn") {
      //   warnings.push({
      //     warning: `Reservation status is ${reservation.status}`,
      //     warningCode: "invalid_reservation_status",
      //   });
      // }

      if (reservation?.status === "confirmed") {
        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "qr_code_scanned_successfully",
          data: {
            ...reservationData,
            warnings,
            companyWallet
          },
        });
      } else if (
        reservation?.paymentDetails &&
        reservation.paymentDetails.paymentStatus !== "paid"
      ) {
        warnings.push({
          warning: "Reservation payment is not completed",
          warningCode: "payment_not_completed",
        });
      }

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "qr_code_scanned_successfully",
        data: {
          ...reservationData,
          warnings,
          companyWallet
        },
      });
    }
    else if (type === "loyaltyReward") {
      const rewardLookupId = id || qrData.bookingId;
      if (!rewardLookupId) validateData.rawData.push("qrData.id");

      if (!validateParams(req, res, validateData)) return;

      const loyaltyRewardOrder =
        await getLoyaltyRewardOrderDetailsService(rewardLookupId);


      if (!loyaltyRewardOrder) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "order_not_found",
        });
      }

      let warnings = [];

      /* =========================
         🔹 ORGANIZER MISMATCH
      ========================== */
      if (
        loyaltyRewardOrder.companyOrganizer?._id?.toString() !==
        companyOrganizer?.toString()
      ) {
        warnings.push({
          warning: "Organizer mismatch for reward order",
          warningCode: "organizer_mismatch",
        });
      }
      if (user_id.companyDetails.status !== "active") {
        warnings.push({
          warning: "Company is not active",
          warningCode: "company_inactive",
        });
      }

      /* =========================
         🔹 ALREADY COMPLETED / REDEEMED
      ========================== */
      if (
        loyaltyRewardOrder.status === "completed"
      ) {
        warnings.push({
          warning: `Reward already ${loyaltyRewardOrder.status}`,
          warningCode: "reward_already_processed",
        });
      }
      if (
        loyaltyRewardOrder.status === "expired"
      ) {
        warnings.push({
          warning: `Reward already ${loyaltyRewardOrder.status}`,
          warningCode: "reward_expired",
        });
      }

      // buyMenuItemReward: match equivalents and require one on organizer active menus
      // (scoped to qrData.organization when provided)
      const snapshot = loyaltyRewardOrder.snapshot;
      if (snapshot?.rewardType === "buyMenuItemReward" && snapshot?.menuItem) {
        const organizerId =
          loyaltyRewardOrder.companyOrganizer?._id ||
          loyaltyRewardOrder.companyOrganizer ||
          companyOrganizer;

        const {
          menuItem,
          equivalentMenuItems,
          activeEquivalentMenuItems,
          isAvailableOnOrganizerActiveMenus,
        } = await resolveBuyMenuItemRewardAvailability(
          snapshot.menuItem,
          organizerId,
          organization
        );

        if (menuItem) {
          loyaltyRewardOrder.snapshot = {
            ...snapshot,
            menuItem,
          };
        }

        loyaltyRewardOrder.equivalentMenuItems = equivalentMenuItems;
        loyaltyRewardOrder.activeEquivalentMenuItems = activeEquivalentMenuItems;

        if (!isAvailableOnOrganizerActiveMenus) {
          warnings.push({
            warning: organization
              ? "Reward menu item is not available on this organization's active menus"
              : "Reward menu item is not available on organizer active menus",
            warningCode: "menu_item_unavailable",
          });
        }
      }

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "qr_code_scanned_successfully",
        data: {
          loyaltyRewardOrder,
          warnings,
        },
      });
    }
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}

module.exports = { scanQrController };
