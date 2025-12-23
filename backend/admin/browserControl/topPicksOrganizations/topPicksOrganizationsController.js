const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const topPicksOrganizationsService = require("./topPicksOrganizationsService");

const createTopPicksOrganization = async (req, res) => {
  const { organization, status = "active", isTop10 } = req.body;

  if (!validateParams(req, res, { rawData: ["organization"], objectIdFields: ["organization"] })) return;

  try {
    const topPicksOrganization = await topPicksOrganizationsService.createTopPicksOrganization({
      organization,
      isTop10,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "top_picks_organization_created_successfully",
      data: topPicksOrganization,
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

const getTopPicksOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { topPicksOrganizations, meta } = await topPicksOrganizationsService.getTopPicksOrganizations({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_picks_organizations_fetched_successfully",
      data: topPicksOrganizations,
      meta: {
        ...generateMeta(page, limit, meta.total),
        topPicksOrganizationsCount: meta.topPicksOrganizationsCount,
      },
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


const updateTopPicksOrganization = async (req, res) => {
  const { id } = req.params;
  const { organization, isTop10, status, order } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await topPicksOrganizationsService.updateTopPicksOrganization(id, {
      organization,
      isTop10,
      status,
      order,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_picks_organization_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_picks_organization_updated_successfully",
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

const deleteTopPicksOrganization = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await topPicksOrganizationsService.deleteTopPicksOrganization(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_picks_organization_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_picks_organization_deleted_successfully",
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

const reorderTopPicksOrganization = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await topPicksOrganizationsService.reorderTopPicksOrganization(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_picks_organization_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_picks_organization_reordered_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: error
    });
  }
};

module.exports = {
  createTopPicksOrganization,
  getTopPicksOrganizations,
  updateTopPicksOrganization,
  deleteTopPicksOrganization,
  reorderTopPicksOrganization,
};