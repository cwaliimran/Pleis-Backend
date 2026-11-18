const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require("mongoose");
const ReservationType = require("@ReservationTypeModel");

const ReservationPreferencesService = require("./reservationPreferencesService");

/**
 * Guest app (GET /app/reservations/reservation-preferences): same preferences,
 * but reservations are offered only while the venue has at least one active
 * reservation type (Reservations prototype v3.2: "The reservation section will
 * not appear in the user app until at least one active type is created").
 * Without it the app showed the form and the booking failed on the missing
 * reservationType. The admin panel keeps the organizer's own switch as stored.
 */
const getReservationPreferencesForApp = async (req, res) => {
  const { organization } = req.query;
  try {
    if (!organization || !mongoose.Types.ObjectId.isValid(String(organization))) {
      return sendResponse({ res, statusCode: 400, translationKey: "organization_required" });
    }
    const [doc, activeTypes] = await Promise.all([
      ReservationPreferencesService.getReservationPreferencess({ organization }),
      ReservationType.countDocuments({
        organization: new mongoose.Types.ObjectId(String(organization)),
        status: "active",
      }),
    ]);
    const preferences = { ...(doc?.reservationPreferences || {}) };
    if (activeTypes === 0) {
      preferences.isReservationEnabled = false;
      preferences.reservationUnavailableReason = "no_active_reservation_types";
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_Preferencess_fetched_successfully",
      data: preferences,
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

const getReservationPreferencess = async (req, res) => {
  const { organization } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_required",
      });
    }

    const ReservationPreferencess = await ReservationPreferencesService.getReservationPreferencess({
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_Preferencess_fetched_successfully",
      data: ReservationPreferencess?.reservationPreferences || {},
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
const updateReservationPreferences = async (req, res) => {
  const { id } = req.params;
  let { companyOrganizer, isReservationEnabled, timeSlotsSetting, automaticResponse, cancellationPolicy, noShowPolicy } = req.body;
  const organization = id;
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }
  if (!companyOrganizer || !organization) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "companyOrganizer_and_organization_required",
    });
  }

  if (noShowPolicy !== undefined) {
    const grace = Number(noShowPolicy?.gracePeriodMinutes);
    if (![15, 30, 45, 60].includes(grace)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_no_show_grace_period",
      });
    }
    noShowPolicy = { gracePeriodMinutes: grace };
  }

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    companyOrganizer,
    isReservationEnabled,
    timeSlotsSetting,
    automaticResponse,
    cancellationPolicy,
    noShowPolicy,
    organization,
  };

  try {
    const updated = await ReservationPreferencesService.updateReservationPreferences(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ReservationPreferences_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationPreferences_updated_successfully",
      data: updated,
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

module.exports = {
  getReservationPreferencesForApp,
  getReservationPreferencess,
  updateReservationPreferences,
};
