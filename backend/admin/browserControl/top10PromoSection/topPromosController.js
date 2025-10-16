const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const topPromosService = require("./topPromosService");

const createTopPromo = async (req, res) => {
  const { event, status = "active" } = req.body;

  if (!validateParams(req, res, { rawData: ["event"], objectIdFields: ["event"] })) return;

  try {
    const topPromo = await topPromosService.createTopPromo({
      event,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "top_promo_created_successfully",
      data: topPromo,
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

const getTopPromos = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { topPromos, meta } = await topPromosService.getTopPromos({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    const populatedTopPromos = await Promise.all(topPromos.map(async (promo) => {
      return await promo.populate('event');
    }));

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_promos_fetched_successfully",
      data: populatedTopPromos,
      meta: {
        ...generateMeta(page, limit, meta.total),
        topPromosCount: meta.topPromosCount,
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


const updateTopPromo = async (req, res) => {
  const { id } = req.params;
  const { event, status, order } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const updated = await topPromosService.updateTopPromo(id, {
      event,
      status,
      order,
    });

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_promo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_promo_updated_successfully",
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

const deleteTopPromo = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await topPromosService.deleteTopPromo(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_promo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_promo_deleted_successfully",
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

const reorderTopPromo = async (req, res) => {
  const { movedId, previousOrder, newOrder } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["movedId", "previousOrder", "newOrder"],
      objectIdFields: ["movedId"],
    })
  )
    return;

  try {
    const reordered = await topPromosService.reorderTopPromo(
      movedId,
      previousOrder,
      newOrder
    );

    if (!reordered) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "top_promo_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_promo_reordered_successfully",
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
  createTopPromo,
  getTopPromos,
  updateTopPromo,
  deleteTopPromo,
  reorderTopPromo,
};