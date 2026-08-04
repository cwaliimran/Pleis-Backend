const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../../helperUtils/responseUtil");

const PaymentMethodService = require("./paymentMethodService");

const getPaymentMethods = async (req, res) => {
  const { organization, companyOrganizer } = req.query;
  try {
    if (!organization || !companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_and_companyOrganizer_required",
      });
    }

    const timezone = req.user.timezone;

    const PaymentMethodData = await PaymentMethodService.getPaymentMethods({
      organization,
      companyOrganizer,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PaymentMethods_fetched_successfully",
      data: PaymentMethodData,
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
const updatePaymentMethod = async (req, res) => {
  const { id } = req.params;
  let { inAppPayments, payNow } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    inAppPayments,
    payNow,
  };

  try {
    const updated = await PaymentMethodService.updatePaymentMethod(id, data);
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
        translationKey: "PaymentMethod_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PaymentMethod_updated_successfully",
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
  getPaymentMethods,
  updatePaymentMethod,
};
