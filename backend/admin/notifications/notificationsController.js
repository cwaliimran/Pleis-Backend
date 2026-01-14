const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const NotificationsService = require("./notificationsService");





const createNotifications = async (req, res) => {
  try {
    // Extracting fields from the request body
    let {
      title,
      message,
      image,
      location,
      ageRange,
      gender,
      interests,
      sendTiming,
      scheduledDateTime,
      destinationType,
      organizationId,
      eventId
    } = req.body;

    const userId = req.user._id;
    const timezone = req.user.timezone;


    // Check if organizationId is required for "organization" destination type
    if (destinationType === "organization" && !organizationId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organizationId_is_required_for_organization_destinationType",
      });
    }

    // Check if eventId is required for "event" destination type
    if (destinationType === "event" && !eventId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "eventId_is_required_for_event_destinationType",
      });
    }

    // Validate required parameters
    if (
      !validateParams(req, res, {
        rawData: ["title", "message", "image", "sendTiming", "destinationType"],
      })
    ) return;

    if (location) {
      // Check if city and radius are provided together
      if (!location.city || !location.radius) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Location_city_and_radius_required_together",
        });
      }

      // Check if latitude and longitude are provided, and if they are within valid ranges
      if (location.lat && location.long) {
        // Check if latitude is between -90 and 90
        if (location.lat < -90 || location.lat > 90) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "Location_invalid_latitude",
          });
        }

        // Check if longitude is between -180 and 180
        if (location.long < -180 || location.long > 180) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "Location_invalid_longitude",
          });
        }
      } else {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "Location_lat_long_required",
        });
      }
    }

    // Validate age range if provided
    if (ageRange && (!Array.isArray(ageRange) || ageRange.length !== 2 || ageRange[0] > ageRange[1])) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Invalid_age_range",
      });
    }

    // Validate scheduledDateTime when sendTiming is "schedule"
    if (sendTiming === "schedule" && !scheduledDateTime) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Scheduled_date_time_required",
      });
    }

    // Convert scheduledDateTime to UTC if the notification is scheduled
    if (sendTiming === "schedule") {
      scheduledDateTime = convertTimezoneToUtc(scheduledDateTime, timezone);
    }
    let center;
    let radius = 0;
    if (location) {
      center = {
        type: "Point",
        coordinates: [Number(location.long), Number(location.lat)]
      };
      radius = Number(location.radius) || 0;
    }
   
    // Prepare the data object to be saved (only include provided fields)
    const data = {
      creator: userId,
      title,
      message,
      image: image || "", // Default image to empty string if not provided
      center: center || null,
      radius: radius || 0,
      ageRange,
      gender,
      interests,
      sendTiming,
      scheduledDateTime,
      status: "active",
      location

    };

    // Only add organizationId or eventId if they are provided
    if (destinationType === "organization" && organizationId) {
      data.destinationType = "organizationNotification";
      data.organizationId = organizationId;
    }
    if (destinationType === "event" && eventId) {
      data.eventId = eventId;
      data.destinationType = "eventNotification";
    }
    if (destinationType === "home") {
      data.destinationType = "homeNotification";
    }

    // Create the notification in the database
    const globalNotification = await NotificationsService.createNotifications(data);

    // Check if the notification was created successfully
    if (!globalNotification) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Notifications_creation_failed",
      });
    }

    // Return success response
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Notifications_created_successfully",
      data: globalNotification,
    });

  } catch (error) {
    // Handle any errors that occur during the process
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500, // Default to 500 if no specific status
      translationKey: readableError.message || "Something_went_wrong", // Default to a general error message
      error,
    });
  }
};


const getNotificationss = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range ,sendTiming,isDelivered} = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { Notificationss, meta } = await NotificationsService.getNotificationss({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
      sendTiming,
      isDelivered
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Notificationss_fetched_successfully",
      data: Notificationss,
      meta,
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
const updateNotifications = async (req, res) => {
  const { id } = req.params;
  let {
    title,
    description,
    discountType,
    discountValue,
    Notifications,
    maxDiscountCap,
    maxCountPerUser,
    status,
    expiryDate,
    maxUsage,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;
  expiryDate = convertTimezoneToUtc(
    expiryDate,
    timezone,
  );
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    companyOrganizer: userId,
    title,
    description,
    Notifications,
    discountType,
    discountValue,
    status,
    maxDiscountCap,
    expiryDate,
    maxUsage,
    maxCountPerUser,
  };


  try {
    const updated = await NotificationsService.updateNotifications(id, data);
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
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
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

const deleteNotifications = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await NotificationsService.deleteNotifications(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Notifications_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Notifications_deleted_successfully",
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









const getOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { organizations, meta } = await NotificationsService.getOrganizations({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Organizations_fetched_successfully",
      data: organizations,
      meta,
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


const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { events, meta } = await NotificationsService.getEvents({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Events_fetched_successfully",
      data: events,
      meta,
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




const gettags = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { events, meta } = await NotificationsService.gettags({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Events_fetched_successfully",
      data: events,
      meta,
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
  createNotifications,
  getNotificationss,
  updateNotifications,
  deleteNotifications,
  getOrganizations,
  getEvents,
  gettags

};