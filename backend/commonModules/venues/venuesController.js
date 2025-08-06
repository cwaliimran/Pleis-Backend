const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const venuesService = require("./venuesService");

const createVenue = async (req, res) => {
  const {
    title,
    floorPlan,
    venueType,
    organization,
    isPrimary,
    location,
    image,
    status = "active",
    pinned = false,
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["title", "venueType", "location"],
      objectIdFields: ["venueType"],
    })
  )
    return;

  let data = {
    title,
    floorPlan,
    venueType,
    organization,
    isPrimary,
    location,
    image,
    status,
    pinned,
    creator: req.user._id,
  };

  try {
    const venue = await venuesService.createVenue(data);
    if (!venue) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "venue_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "venue_created_successfully",
      data: venue,
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

const getVenues = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", pinned } = req.query;
  const { _id: userId } = req.user._id;
  try {
    const { venues, meta } = await venuesService.getVenues({
      page,
      limit,
      keyword,
      status,
      pinned,
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venues_fetched_successfully",
      data: venues,
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
const getVenueDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const venue = await venuesService.getVenueDetails(id);
    if (!venue) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_details_fetched_successfully",
      data: venue,
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
const updateVenue = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    floorPlan,
    venueType,
    organization,
    isPrimary,
    location,
    image,
    status = "active",
    pinned = false,
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    title,
    floorPlan,
    venueType,
    organization,
    isPrimary,
    location,
    image,
    status,
    pinned,
  };

  try {
    const updated = await venuesService.updateVenue(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_not_found",
      });
    }
    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_updated_successfully",
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

const deleteVenue = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await venuesService.deleteVenue(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_deleted_successfully",
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
  createVenue,
  getVenues,
  updateVenue,
  deleteVenue,
  getVenueDetails,
};
