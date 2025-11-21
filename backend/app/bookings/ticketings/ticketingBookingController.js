const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const { createTicketingBookingService,
  getTicketingBookingsService,
  getTicketingBookingByIdService,
  updateTicketingBookingService,
  deleteTicketingBookingService, } = require("./ticketingBookingService");

const createTicketingBooking = async (req, res) => {
  try {
    const { timezone, _id: userId } = req.user;
    const {
      paymentDetails,
      ticketings = [],
    } = req.body;

    // ==============================
    // STEP 1: PREPARE VALIDATION DATA
    // ==============================
    const validateData = {
      rawData: ["ticketings", "paymentDetails"],
    };

    // ==============================
    // STEP 2: VALIDATE ALL FIELDS
    // ==============================
    if (!validateParams(req, res, validateData)) return;

    // ==============================
    // STEP 3: CONVERT DATES TO UTC
    // ==============================
    const ticketingBookingPayload = {
      user: userId,
      ticketings,
      paymentDetails,
    };

    // ==============================
    // STEP 4: CREATE TICKETINGBOOKING
    // ==============================
    const ticketingBooking = await createTicketingBookingService(ticketingBookingPayload, timezone);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "ticketing_booking_created_successfully",
      data: ticketingBooking,
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

module.exports = { createTicketingBooking, getTicketingBookings, getTicketingBookingById, updateTicketingBooking, deleteTicketingBooking };