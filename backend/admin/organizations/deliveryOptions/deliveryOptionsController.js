const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const deliveryOptionsService = require("./deliveryOptionsService");

const DELIVERY_METHODS = ["counterPickup", "tableDelivery", "toGo"];
const STATUS_VALUES = ["active", "inactive"];

const createDeliveryOption = async (req, res) => {
  const { organizationId } = req.params;
  const { title, deliveryMethod = "counterPickup", status = "active" } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["organizationId"],
      objectIdFields: ["organizationId"],
      rawData: ["title"],
      enumFields: {
        deliveryMethod: DELIVERY_METHODS,
        status: STATUS_VALUES,
      },
    })
  ) {
    return;
  }

  try {
    const deliveryOption = await deliveryOptionsService.createDeliveryOption({
      organization: organizationId,
      title,
      deliveryMethod,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "delivery_option_created_successfully",
      data: deliveryOption,
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

const getDeliveryOptions = async (req, res) => {
  const { organizationId } = req.params;
  const { status } = req.query;

  if (
    !validateParams(req, res, {
      pathParams: ["organizationId"],
      objectIdFields: ["organizationId"],
      enumFields: {
        status: STATUS_VALUES,
      },
    })
  ) {
    return;
  }

  try {
    const deliveryOptions = await deliveryOptionsService.getDeliveryOptions({
      organizationId,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "delivery_options_fetched_successfully",
      data: deliveryOptions,
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

const getDeliveryOptionDetails = async (req, res) => {
  const { organizationId, id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["organizationId", "id"],
      objectIdFields: ["organizationId", "id"],
    })
  ) {
    return;
  }

  try {
    const deliveryOption = await deliveryOptionsService.getDeliveryOptionDetails(
      id,
      organizationId,
    );

    if (!deliveryOption) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "delivery_option_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "delivery_option_fetched_successfully",
      data: deliveryOption,
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

const updateDeliveryOption = async (req, res) => {
  const { organizationId, id } = req.params;
  const { title, deliveryMethod, status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["organizationId", "id"],
      objectIdFields: ["organizationId", "id"],
      enumFields: {
        deliveryMethod: DELIVERY_METHODS,
        status: STATUS_VALUES,
      },
    })
  ) {
    return;
  }

  try {
    const updated = await deliveryOptionsService.updateDeliveryOption(
      id,
      organizationId,
      { title, deliveryMethod, status },
    );

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "delivery_option_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "delivery_option_updated_successfully",
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

const deleteDeliveryOption = async (req, res) => {
  const { organizationId, id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["organizationId", "id"],
      objectIdFields: ["organizationId", "id"],
    })
  ) {
    return;
  }

  try {
    const deleted = await deliveryOptionsService.deleteDeliveryOption(
      id,
      organizationId,
    );

    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "delivery_option_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "delivery_option_deleted_successfully",
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
  createDeliveryOption,
  getDeliveryOptions,
  getDeliveryOptionDetails,
  updateDeliveryOption,
  deleteDeliveryOption,
};
