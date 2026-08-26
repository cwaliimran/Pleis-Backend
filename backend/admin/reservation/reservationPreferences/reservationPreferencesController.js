const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const ReservationPreferencesService = require("./reservationPreferencesService");

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
  let { companyOrganizer, isReservationEnabled, timeSlotsSetting, automaticResponse, cancellationPolicy } = req.body;
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

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    companyOrganizer,
    isReservationEnabled,
    timeSlotsSetting,
    automaticResponse,
    cancellationPolicy,
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
  getReservationPreferencess,
  updateReservationPreferences,
};
