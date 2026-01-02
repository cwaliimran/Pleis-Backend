const { getUserDetailsForQRService } = require("../../admin/usersManagement/usersService");
const { getTicketingBookingByIdService } = require("../../app/bookings/ticketings/ticketingBookingService");
const { getEventTicketings } = require("../../app/events/eventController");
const { getUserCompanyWallet } = require("../../app/loyalty/clubMembers/clubMembersService");
const { sendResponse, validateParams } = require("@utils/responseUtil");

const scanQrController = async (req, res) => {
  try {
    const { qrData } = req.body;
    const { user, companyOrganizer, type = "loyaltyCard" } = qrData;

    let validateData = {
      rawData: [
        "qrData.companyOrganizer",
        "qrData.type",
      ],
      enumFields: {
        "qrData.type": ["loyaltyCard", "eventTicket"],
      },
    };


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
    else if (type === "eventTicket") {
      validateData.rawData.push("qrData.id");
      validateData.rawData.push("qrData.organization");

      if (
        !validateParams(req, res, validateData)
      ) return;

      const { id, organization } = qrData;

      let eventTicket = await getTicketingBookingByIdService(id);
      if (!eventTicket) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "ticket_not_found",
        });
      }
      let warnings = [];
      //or organization mismatch
      if (eventTicket.organization._id.toString() !== organization.toString()) {
        warnings.push("Organization mismatch for the ticket");
      }
      if (eventTicket?.order?.paymentDetails?.paymentStatus !== "paid") {
        warnings.push("Ticket payment is not completed");
      }

      if (eventTicket.status !== "valid") {
        warnings.push(`Ticket is marked as ${eventTicket.status}`);
      }

      if (eventTicket?.ticket?.snapshot?.repeatable?.isRepeatable) {
        const visits = eventTicket.ticket.snapshot.repeatable.visits || 0;

        if (visits <= 0) {
          warnings.push("No remaining visits on this ticket");
        }
      }



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
