const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const { createTicketingBookingService,
  getTicketingBookingsService,
  getTicketingBookingByIdService,
  updateTicketingBookingService,
  transferTicketingBookingService,
  deleteTicketingBookingService, } = require("./ticketingBookingService");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { validateTicketingPayload } = require("./validators/ticketingValidation");
const { checkoutWithTicketsAndReservation } = require("./services/checkoutOrchestratorService");
const { validateReservationPayload } = require("../../reservations/validators/reservationValidation");
const { attemptTicketingOrdersPayment } = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/paymentService");
const { ticketingOrderFinalizerService } = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");

const createTicketingBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const result = await createTicketingBookingService(
      {
        user: req.user._id,
        ticketings: req.body.ticketings,
        paymentDetails: req.body.paymentDetails,
      },
      req.user.timezone,
      session
    );

    await session.commitTransaction();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "ticketing_booking_created_successfully",
      data: result,
    });

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};



const getTicketingBookings = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status, date, orderSort } = req.query;
    let { timezone, _id: userId } = req.user;
    const ticketingBookings = await getTicketingBookingsService({ page, limit, keyword, status, date, orderSort, timezone, userId });
    return sendResponse({ res, statusCode: 200, translationKey: "ticketing_bookings_fetched_successfully", data: ticketingBookings });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const getTicketingBookingById = async (req, res) => {
  try {
    let { timezone } = req.user;
    const ticketingBooking = await getTicketingBookingByIdService(req.params.id, timezone);
    if (!ticketingBooking) return sendResponse({ res, statusCode: 404, translationKey: "ticketing_booking_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "ticketing_booking_fetched_successfully", data: ticketingBooking });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const updateTicketingBooking = async (req, res) => {
  try {
    const { timezone } = req.user;
    const ticketingBooking = await updateTicketingBookingService(req.params.id, req.body, timezone);
    return sendResponse({ res, statusCode: 200, translationKey: "ticketing_booking_updated_successfully", data: ticketingBooking });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const deleteTicketingBooking = async (req, res) => {
  try {
    const ticketingBooking = await deleteTicketingBookingService(req.params.id);
    return sendResponse({ res, statusCode: 200, translationKey: "ticketing_booking_deleted_successfully", data: ticketingBooking });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const transferTicketingBooking = async (req, res) => {
  try {
    const { timezone, _id: userId } = req.user;
    const { ticketingBookingId, newUserId } = req.body;

    // ==============================
    // STEP 1: PREPARE VALIDATION DATA
    // ==============================
    const validateData = {
      objectIdFields: ["ticketingBookingId", "newUserId"],
    };

    // ==============================
    // STEP 2: VALIDATE ALL FIELDS
    // ==============================
    if (!validateParams(req, res, validateData)) return;

    // ==============================
    // STEP 3: TRANSFER TICKETING BOOKING
    // ==============================
    const { success, message } = await transferTicketingBookingService(ticketingBookingId, newUserId, timezone, userId);
    if (!success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: message,
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: message,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = { createTicketingBooking, transferTicketingBooking, getTicketingBookings, getTicketingBookingById, updateTicketingBooking, deleteTicketingBooking };