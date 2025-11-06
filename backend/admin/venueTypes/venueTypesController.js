const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const venuetypesService = require("./venueTypesService");

const createVenueType = async (req, res) => {
  const { image, title, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["title"] })) return;

  try {
    const venuetype = await venuetypesService.createVenueType({
      image,
      title,
      status: "active",
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "venue_type_created_successfully",
      data: venuetype,
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

const getVenueTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const { venueTypes, meta } = await venuetypesService.getVenueTypes({
      page,
      limit,
      keyword,
      status,
      date
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_types_fetched_successfully",
      data: venueTypes,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getPublicVenueTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, date } = req.query;
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const { venueTypes, meta } = await venuetypesService.getPublicVenueTypes({
      page,
      limit,
      keyword,
      date
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_types_fetched_successfully",
      data: venueTypes,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const updateVenueType = async (req, res) => {
  const { id } = req.params;
  const { image, title, status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await venuetypesService.updateVenueType(id, {
      image,
      title,
      status,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_type_updated_successfully",
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

const deleteVenueType = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await venuetypesService.deleteVenueType(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "venue_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_type_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  createVenueType,
  getVenueTypes,
  getPublicVenueTypes,
  updateVenueType,
  deleteVenueType,
};
